// src/rabbitmq/rabbitmq.service.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqp from 'amqplib'

@Injectable()
export class RabbitMQService {
  private readonly logger = new Logger(RabbitMQService.name)
  private connection: amqp.Connection | null = null
  private channel: amqp.Channel | null = null
  private readonly retryAttempts = 5
  private readonly retryDelay = 3000

  private rabbitmqUrl: string
  private exchange: string

  constructor(private configService: ConfigService) {
    this.rabbitmqUrl = this.configService.get('RABBITMQ_URL', 'amqp://localhost:5672')
    this.exchange = this.configService.get('RABBITMQ_EXCHANGE', 'channels')
  }

  /**
   * Connect to RabbitMQ with retries
   */
  async connect(retries: number = this.retryAttempts): Promise<void> {
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
        await this.connect(retries - 1)
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error(`❌ Failed to connect to RabbitMQ after ${this.retryAttempts} attempts: ${errorMessage}`)
        throw error
      }
    }
  }

  /**
   * Publish a message to an exchange with a routing key
   */
  async publish(routingKey: string, payload: Record<string, any>): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not connected')
    }

    try {
      this.channel.publish(
        this.exchange,
        routingKey,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true },
      )

      this.logger.debug(`Published message to ${routingKey}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to publish message: ${errorMessage}`)
      throw error
    }
  }

  /**
   * Subscribe to a queue and consume messages
   */
  async subscribe(
    queue: string,
    routingKey: string,
    handler: (payload: Record<string, any>) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not connected')
    }

    try {
      // Assert queue and binding
      await this.channel.assertQueue(queue, { durable: true })
      await this.channel.bindQueue(queue, this.exchange, routingKey)

      // Set prefetch
      await this.channel.prefetch(1)

      // Consume messages
      this.channel.consume(
        queue,
        async (message) => {
          if (message) {
            try {
              const payload = JSON.parse(message.content.toString())
              await handler(payload)
              this.channel?.ack(message)
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error)
              this.logger.error(`Error processing message: ${errorMessage}`)
              this.channel?.nack(message, false, true)
            }
          }
        },
        { noAck: false },
      )

      this.logger.log(`Subscribed to ${queue} (routing key: ${routingKey})`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to subscribe: ${errorMessage}`)
      throw error
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close()
    }
    if (this.connection) {
      await this.connection.close()
    }
    this.logger.log('RabbitMQ connection closed')
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return !!this.channel && !!this.connection
  }
}
