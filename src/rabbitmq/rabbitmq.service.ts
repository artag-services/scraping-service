// src/rabbitmq/rabbitmq.service.ts

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqp from 'amqplib'

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name)
  private connection: amqp.Connection | null = null
  private channel: amqp.Channel | null = null
  private readonly retryAttempts = 5
  private readonly retryDelay = 3000
  private connecting = false
  private connectPromise: Promise<void> | null = null

  private rabbitmqUrl: string
  private exchange: string

  constructor(private configService: ConfigService) {
    this.rabbitmqUrl = this.configService.get('RABBITMQ_URL', 'amqp://localhost:5672')
    this.exchange = this.configService.get('RABBITMQ_EXCHANGE', 'channels')
  }

  /**
   * Initialize connection on module init
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.connect()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to connect during module init: ${msg}`)
      // Don't throw - allow graceful degradation
    }
  }

  /**
   * ✨ NEW: Cleanup connection on module destroy (graceful shutdown)
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('🛑 RabbitMQService shutting down...')
    await this.disconnect()
  }

  /**
   * Connect to RabbitMQ with retries
   */
  async connect(retries: number = this.retryAttempts): Promise<void> {
    // If already connecting, wait for that promise
    if (this.connecting && this.connectPromise) {
      await this.connectPromise
      return
    }

    // If already connected, return
    if (this.isConnected()) {
      return
    }

    try {
      this.connecting = true
      this.connectPromise = this._doConnect(retries)
      await this.connectPromise
    } finally {
      this.connecting = false
      this.connectPromise = null
    }
  }

  /**
   * Internal connect implementation
   */
  private async _doConnect(retries: number): Promise<void> {
    try {
      this.logger.log(`🔌 Connecting to RabbitMQ at ${this.rabbitmqUrl}...`)
      this.connection = await amqp.connect(this.rabbitmqUrl)
      this.channel = await this.connection.createChannel()

      // Assert exchange
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true })

      this.logger.log(`✅ Connected to RabbitMQ successfully`)
    } catch (error) {
      if (retries > 0) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.warn(
          `Failed to connect (retries left: ${retries}): ${errorMessage}. Retrying in ${this.retryDelay}ms...`,
        )
        await new Promise(resolve => setTimeout(resolve, this.retryDelay))
        await this._doConnect(retries - 1)
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error(`❌ Failed to connect to RabbitMQ after ${this.retryAttempts} attempts: ${errorMessage}`)
        throw error
      }
    }
  }

  /**
   * Publish a message to an exchange with a routing key
   * ✨ IMPROVED: Detailed logging for debugging
   */
  async publish(routingKey: string, payload: Record<string, any>): Promise<void> {
    // Auto-connect if needed
    if (!this.isConnected()) {
      await this.connect()
    }

    if (!this.channel) {
      throw new Error('RabbitMQ channel not connected')
    }

    try {
      // ✨ LOG: About to serialize and publish
      this.logger.log(`📤 RabbitMQService.publish() - START`)
      this.logger.log(`   - exchange: ${this.exchange}`)
      this.logger.log(`   - routingKey: ${routingKey}`)
      this.logger.log(`   - payloadKeys: ${Object.keys(payload).join(', ')}`)
      this.logger.log(`   - payloadSize: ${JSON.stringify(payload).length} bytes`)

      const buffer = Buffer.from(JSON.stringify(payload))

      // ✨ LOG: Buffer prepared
      this.logger.log(`   - bufferSize: ${buffer.length} bytes`)
      this.logger.log(`   - attempting to publish to RabbitMQ...`)

      // Publish to RabbitMQ with persistent flag
      const published = this.channel!.publish(
        this.exchange,
        routingKey,
        buffer,
        { persistent: true, contentType: 'application/json' },
      )

      if (!published) {
        const error = new Error(`RabbitMQ channel buffer full for ${routingKey}`)
        this.logger.error(`❌ FAILED: ${error.message}`)
        throw error
      }

      // ✨ LOG: Success
      this.logger.log(`✅ RabbitMQService.publish() - SUCCESS`)
      this.logger.log(`   - routingKey: ${routingKey}`)
      this.logger.log(`   - messageId: ${payload.messageId || 'N/A'}`)
      this.logger.log(`   - published to exchange: ${this.exchange}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ RabbitMQService.publish() - ERROR:`)
      this.logger.error(`   - routingKey: ${routingKey}`)
      this.logger.error(`   - errorMessage: ${errorMessage}`)
      this.logger.error(`   - errorStack: ${error instanceof Error ? error.stack : 'N/A'}`)
      throw error
    }
  }

  /**
   * Subscribe to a queue and consume messages
   * ✨ IMPROVED: Auto-connect if needed (like publish method)
   */
  async subscribe(
    queue: string,
    routingKey: string,
    handler: (payload: Record<string, any>) => Promise<void>,
  ): Promise<void> {
    // Auto-connect if needed
    if (!this.isConnected()) {
      this.logger.log(`📤 RabbitMQService.subscribe() - Auto-connecting to RabbitMQ...`)
      await this.connect()
    }

    if (!this.channel) {
      throw new Error('RabbitMQ channel not connected')
    }

    try {
      // Assert queue and binding
      await this.channel.assertQueue(queue, { durable: true })
      await this.channel.bindQueue(queue, this.exchange, routingKey)

      // Set prefetch - process one message at a time
      await this.channel.prefetch(1)

      // Consume messages
      this.channel.consume(
        queue,
        async (message) => {
          if (message) {
            try {
              const payload = JSON.parse(message.content.toString())
              this.logger.debug(`📨 Received message from ${queue}`)
              await handler(payload)
              this.channel?.ack(message)
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error)
              this.logger.error(`❌ Error processing message from [${queue}]: ${errorMessage}`)
              // ✨ CHANGED: Use standard pattern - don't requeue (false)
              // This prevents infinite loops on permanent errors
              this.channel?.nack(message, false, false)
            }
          }
        },
        { noAck: false },
      )

      this.logger.log(`✅ Subscribed to ${queue} | routing key: ${routingKey}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to subscribe to ${queue}: ${errorMessage}`)
      throw error
    }
  }

  /**
   * ✨ NEW: Disconnect helper (internal, called by onModuleDestroy)
   */
  private async disconnect(): Promise<void> {
    if (this.channel) {
      await this.channel.close()
    }
    if (this.connection) {
      await this.connection.close()
    }
    this.logger.log('✅ RabbitMQ connection closed gracefully')
  }

  /**
   * Close connection (public method for manual shutdown)
   */
  async close(): Promise<void> {
    await this.disconnect()
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return !!this.channel && !!this.connection
  }
}
