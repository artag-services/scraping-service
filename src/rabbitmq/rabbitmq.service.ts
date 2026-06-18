import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqp from 'amqplib'

interface SubscriptionEntry {
  queue: string
  routingKey: string
  handler: (payload: Record<string, any>) => Promise<void>
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name)
  private connection: amqp.Connection | null = null
  private channel: amqp.Channel | null = null
  private readonly retryAttempts = 5
  private readonly retryDelay = 3000
  private connecting = false
  private connectPromise: Promise<void> | null = null
  private consumerTags: string[] = []
  private subscriptions: SubscriptionEntry[] = []
  private reconnecting = false

  private rabbitmqUrl: string
  private exchange: string

  constructor(private configService: ConfigService) {
    this.rabbitmqUrl = this.configService.get('RABBITMQ_URL', 'amqp://localhost:5672')
    this.exchange = this.configService.get('RABBITMQ_EXCHANGE', 'channels')
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.connect()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to connect during module init: ${msg}`)
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('RabbitMQService shutting down...')
    await this.disconnect()
  }

  async connect(retries: number = this.retryAttempts): Promise<void> {
    if (this.connecting && this.connectPromise) {
      await this.connectPromise
      return
    }

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

  private async _doConnect(retries: number): Promise<void> {
    try {
      this.logger.log(`Connecting to RabbitMQ at ${this.rabbitmqUrl}...`)
      this.connection = await amqp.connect(this.rabbitmqUrl)

      this.connection.on('error', (err) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`)
      });

      this.connection.on('close', () => {
        if (this.reconnecting) return
        this.reconnecting = true
        this.logger.warn('RabbitMQ connection closed — reconnecting...')
        this.channel = null
        this.connection = null
        this.consumerTags = []
        this.connect()
          .then(() => this._replaySubscriptions())
          .catch((e) => this.logger.error(`Reconnection failed: ${e.message}`))
          .finally(() => { this.reconnecting = false })
      });

      this.channel = await this.connection.createChannel()

      this.channel.on('error', (err) => {
        this.logger.error(`RabbitMQ channel error: ${err.message}`)
      });

      await this.channel.assertExchange(this.exchange, 'topic', { durable: true })

      this.logger.log('Connected to RabbitMQ successfully')
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
        this.logger.error(`Failed to connect to RabbitMQ after ${this.retryAttempts} attempts: ${errorMessage}`)
        throw error
      }
    }
  }

  private async _replaySubscriptions(): Promise<void> {
    if (!this.channel) return
    for (const sub of this.subscriptions) {
      try {
        await this.channel.assertQueue(sub.queue, { durable: true })
        await this.channel.bindQueue(sub.queue, this.exchange, sub.routingKey)
        await this.channel.prefetch(1)
        const result = await this.channel.consume(
          sub.queue,
          async (message) => {
            if (message) {
              try {
                const payload = JSON.parse((message as any).content.toString())
                this.logger.debug(`Received message from ${sub.queue}`)
                await sub.handler(payload)
                this.channel?.ack(message)
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                this.logger.error(`Error processing message from [${sub.queue}]: ${errorMessage}`)
                this.channel?.nack(message, false, false)
              }
            }
          },
          { noAck: false },
        )
        this.consumerTags.push(result.consumerTag)
        this.logger.log(`Resubscribed to ${sub.queue} | routing key: ${sub.routingKey}`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error(`Failed to resubscribe to ${sub.queue}: ${errorMessage}`)
      }
    }
  }

  async publish(routingKey: string, payload: Record<string, any>): Promise<void> {
    if (!this.isConnected()) {
      await this.connect()
    }

    if (!this.channel) {
      throw new Error('RabbitMQ channel not connected')
    }

    try {
      const buffer = Buffer.from(JSON.stringify(payload))

      const published = this.channel.publish(
        this.exchange,
        routingKey,
        buffer,
        { persistent: true, contentType: 'application/json' },
      )

      if (!published) {
        throw new Error(`RabbitMQ channel buffer full for ${routingKey}`)
      }

      this.logger.debug(`Published to ${routingKey} (${buffer.length} bytes)`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to publish to ${routingKey}: ${errorMessage}`)
      throw error
    }
  }

  async subscribe(
    queue: string,
    routingKey: string,
    handler: (payload: Record<string, any>) => Promise<void>,
  ): Promise<void> {
    if (!this.isConnected()) {
      this.logger.log(`Auto-connecting to RabbitMQ for subscribe to ${queue}...`)
      await this.connect()
    }

    if (!this.channel) {
      throw new Error('RabbitMQ channel not connected')
    }

    try {
      await this.channel.assertQueue(queue, { durable: true })
      await this.channel.bindQueue(queue, this.exchange, routingKey)
      await this.channel.prefetch(1)

      const result = await this.channel.consume(
        queue,
        async (message) => {
          if (message) {
            try {
              const payload = JSON.parse((message as any).content.toString())
              this.logger.debug(`Received message from ${queue}`)
              await handler(payload)
              this.channel?.ack(message)
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error)
              this.logger.error(`Error processing message from [${queue}]: ${errorMessage}`)
              this.channel?.nack(message, false, false)
            }
          }
        },
        { noAck: false },
      )
      const consumerTag = result.consumerTag

      this.subscriptions.push({ queue, routingKey, handler })
      this.consumerTags.push(consumerTag)
      this.logger.log(`Subscribed to ${queue} | routing key: ${routingKey}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to subscribe to ${queue}: ${errorMessage}`)
      throw error
    }
  }

  private async disconnect(): Promise<void> {
    if (this.channel) {
      try { await this.channel.close() } catch {}
    }
    if (this.connection) {
      try { await this.connection.close() } catch {}
    }
    this.channel = null
    this.connection = null
    this.consumerTags = []
    this.logger.log('RabbitMQ connection closed')
  }

  async close(): Promise<void> {
    await this.disconnect()
  }

  isConnected(): boolean {
    return !!this.channel && !!this.connection
  }
}
