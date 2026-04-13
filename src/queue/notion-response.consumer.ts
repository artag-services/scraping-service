// src/queue/notion-response.consumer.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqp from 'amqplib'
import { NotificationService } from '../notifications/notification.service'

@Injectable()
export class NotionResponseConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotionResponseConsumer.name)
  private connection: amqp.Connection | null = null
  private channel: amqp.Channel | null = null

  private rabbitmqUrl: string
  private exchange: string
  private responseQueue: string
  private responseRoutingKey: string
  private personalWhatsappNumber: string

  constructor(
    private configService: ConfigService,
    private notificationService: NotificationService,
  ) {
    this.rabbitmqUrl = this.configService.get('RABBITMQ_URL', 'amqp://localhost:5672')
    this.exchange = this.configService.get('RABBITMQ_EXCHANGE', 'channels')
    this.responseQueue = 'scrapping.notion-response'
    this.responseRoutingKey = 'channels.scrapping.notion-response'
    this.personalWhatsappNumber = this.configService.get('PERSONAL_WHATSAPP_NUMBER', '573205711428')
    
    this.logger.log(
      `NotionResponseConsumer configured: queue=${this.responseQueue}, personalNumber=${this.personalWhatsappNumber}`,
    )
  }

  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('🚀 NotionResponseConsumer initializing...')
      await this.connect()
      await this.consume()
      this.logger.log('✅ NotionResponseConsumer initialized successfully')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ Failed to initialize NotionResponseConsumer: ${msg}`)
      throw error
    }
  }

  /**
   * Connect to RabbitMQ
   */
  private async connect(): Promise<void> {
    try {
      this.logger.log(`🔌 Connecting to RabbitMQ at ${this.rabbitmqUrl}...`)
      this.connection = await amqp.connect(this.rabbitmqUrl)
      this.channel = await this.connection.createChannel()

      // Assert exchange
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true })

      // Assert queue
      await this.channel.assertQueue(this.responseQueue, { durable: true })

      // Bind queue to routing key
      await this.channel.bindQueue(
        this.responseQueue,
        this.exchange,
        this.responseRoutingKey,
      )

      this.logger.log(`✅ Connected to RabbitMQ. Queue: ${this.responseQueue}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ Failed to connect to RabbitMQ: ${errorMessage}`)
      throw error
    }
  }

  /**
   * Start consuming messages from Notion response queue
   */
  private async consume(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized')
    }

    this.logger.log(`👂 Starting to consume from queue: ${this.responseQueue}`)

    this.channel.consume(
      this.responseQueue,
      async (message: any) => {
        if (message) {
          await this.handleNotionResponse(message)
        }
      },
      { noAck: false },
    )

    this.logger.log('✅ Notion response consumer started and waiting for messages...')
  }

  /**
   * Handle Notion response and send WhatsApp notification
   */
  private async handleNotionResponse(message: any): Promise<void> {
    if (!this.channel) {
      return
    }

    try {
      const payload = JSON.parse(message.content.toString())

      this.logger.log(`📨 Received Notion response: messageId=${payload.messageId}, status=${payload.status}`)

      if (payload.status === 'SUCCESS') {
        const { notionPageUrl, messageId } = payload

        // ✨ [NEW] Enviar notificación WhatsApp al número personal
        const notionMessage = `
✅ *Tu scraping está en Notion*

📄 La página fue creada exitosamente
🔗 Ver en Notion: ${notionPageUrl}

⏰ ${new Date().toLocaleString('es-CO')}
        `.trim()

        this.logger.log(`📱 Sending WhatsApp notification to ${this.personalWhatsappNumber}`)

        await this.notificationService.send('whatsapp', this.personalWhatsappNumber, notionMessage)

        this.logger.log(
          `✅ WhatsApp notification sent for Notion success: messageId=${messageId}`,
        )
      } else {
        this.logger.warn(`⚠️ Notion operation failed: messageId=${payload.messageId}, error=${payload.error}`)
      }

      this.channel.ack(message)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Error handling Notion response: ${errorMessage}`)

      // Reintentar
      this.channel.nack(message, false, true)
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
    this.logger.log('Notion response consumer connection closed')
  }
}
