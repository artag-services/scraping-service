// src/queue/rabbitmq.consumer.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqp from 'amqplib'
import { ScrapingMessage } from '../common/types'
import { PuppeteerScraper } from '../scraper/puppeteer.scraper'
import { NotificationService } from '../notifications/notification.service'
import { SummaryService } from '../utils/summary.service'
import { DataCleanupService } from '../utils/data-cleanup.service'
import { RateLimiter } from '../rate-limit/rate-limiter'

@Injectable()
export class RabbitMQConsumer implements OnModuleInit {
  private readonly logger = new Logger(RabbitMQConsumer.name)
  private connection: amqp.Connection | null = null
  private channel: amqp.Channel | null = null

  private rabbitmqUrl: string
  private exchange: string
  private scrapingQueue: string
  private notificationQueue: string

  constructor(
    private configService: ConfigService,
    private scraper: PuppeteerScraper,
    private notificationService: NotificationService,
    private summaryService: SummaryService,
    private dataCleanupService: DataCleanupService,
    private rateLimiter: RateLimiter,
  ) {
    console.log('🔧 RabbitMQConsumer constructor called')
    this.rabbitmqUrl = this.configService.get('RABBITMQ_URL', 'amqp://localhost:5672')
    this.exchange = this.configService.get('RABBITMQ_EXCHANGE', 'channels')
    this.scrapingQueue = this.configService.get('RABBITMQ_QUEUE_SCRAPING', 'scraping.task')
    this.notificationQueue = this.configService.get('RABBITMQ_QUEUE_NOTIFICATIONS', 'whatsapp_direct_messages')
    console.log(`✓ RabbitMQConsumer configured: url=${this.rabbitmqUrl}, exchange=${this.exchange}, queue=${this.scrapingQueue}`)
  }

  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('🚀 RabbitMQConsumer initializing...')
      console.log('🚀 RabbitMQConsumer initializing (console log)...')
      await this.connect()
      await this.consume()
      this.logger.log('✅ RabbitMQConsumer initialized successfully')
      console.log('✅ RabbitMQConsumer initialized successfully (console log)')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ Failed to initialize RabbitMQConsumer: ${msg}`)
      console.error(`❌ Failed to initialize RabbitMQConsumer: ${msg}`)
      throw error
    }
  }

  /**
   * Conecta a RabbitMQ
   */
  private async connect(): Promise<void> {
    try {
      this.logger.log(`🔌 Connecting to RabbitMQ at ${this.rabbitmqUrl}...`)
      this.connection = await amqp.connect(this.rabbitmqUrl)
      this.channel = await this.connection.createChannel()

      // Declarar exchange
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true })

      // Declarar queues
      await this.channel.assertQueue(this.scrapingQueue, { durable: true })
      await this.channel.assertQueue(this.notificationQueue, { durable: true })

      // Bind scraping queue
      await this.channel.bindQueue(
        this.scrapingQueue,
        this.exchange,
        'channels.scraping.task',
      )

      this.logger.log(`✅ Connected to RabbitMQ successfully. Queue: ${this.scrapingQueue}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ Failed to connect to RabbitMQ: ${errorMessage}`)
      throw error
    }
  }

  /**
   * Comienza a consumir mensajes
   */
  private async consume(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized')
    }

    this.logger.log(`👂 Starting to consume from queue: ${this.scrapingQueue}`)

    this.channel.consume(
      this.scrapingQueue,
      async (message: any) => {
        if (message) {
          await this.processMessage(message)
        }
      },
      { noAck: false },
    )

    this.logger.log('✅ Consumer started and waiting for messages...')
  }

  /**
   * Procesa un mensaje de scraping
   */
  private async processMessage(message: any): Promise<void> {
    if (!this.channel) {
      return
    }

    try {
      const scrapingMessage: ScrapingMessage = JSON.parse(message.content.toString())

      this.logger.log(`Processing scraping request: ${scrapingMessage.requestId} for user ${scrapingMessage.userId}`)

      // Verificar rate limit
      if (this.rateLimiter.isLimited(scrapingMessage.userId)) {
        const status = this.rateLimiter.getStatus(scrapingMessage.userId)
        const errorMessage = `⏰ Límite diario alcanzado (${status.used}/${status.limit}). Reintentas el ${status.resetTime.toLocaleString('es-ES')}`

        this.logger.warn(`Rate limit exceeded for user ${scrapingMessage.userId}`)

        await this.sendNotification(
          scrapingMessage.requestId,
          scrapingMessage.userId,
          errorMessage,
        )

        this.channel.ack(message)
        return
      }

      // Ejecutar scraping
      const result = await this.scraper.scrape(
        scrapingMessage.requestId,
        scrapingMessage.url,
        scrapingMessage.instructions,
        scrapingMessage.userId,
      )

      // Registrar uso
      this.rateLimiter.recordUsage(scrapingMessage.userId)

      if (!result.success) {
        const errorMessage = `❌ Error en scraping: ${result.error}`
        await this.sendNotification(
          scrapingMessage.requestId,
          scrapingMessage.userId,
          errorMessage,
        )
      } else {
        // Log del resultado del scraping
        this.logger.log(`✅ Scraping successful for ${scrapingMessage.url}`)
        this.logger.log(`📊 Extracted data: ${JSON.stringify(result.data, null, 2)}`)
        console.log('✅ SCRAPING RESULT:', JSON.stringify(result.data, null, 2))
        
        // ✨ [NEW] PASO 1: Limpiar datos basura
        const cleanedData = this.dataCleanupService.cleanup(result.data)
        this.logger.log(`✨ Data cleaned: ${JSON.stringify(cleanedData, null, 2)}`)
        
        // ✨ [NEW] PASO 2: Enviar a Notion (async, no bloqueante)
        try {
          await this.notificationService.send(
            'notion',
            scrapingMessage.userId,
            cleanedData,
            { 
              url: scrapingMessage.url,
            }
          )
          this.logger.log(`✅ Notion notification sent for user ${scrapingMessage.userId}`)
        } catch (notionError) {
          this.logger.error(`⚠️ Failed to send Notion notification: ${notionError instanceof Error ? notionError.message : String(notionError)}`)
          // No bloqueamos el flujo si Notion falla
        }
        
        // PASO 3: Generar resumen inteligente y enviar por WhatsApp
        const summary = this.summaryService.summarizeWithHeader(cleanedData as any, scrapingMessage.url)
        const chunks = this.summaryService.chunk(summary)

        this.logger.log(`📝 Generated summary with ${chunks.length} chunks`)
        console.log(`📝 SUMMARY (${chunks.length} chunks):`, summary.substring(0, 200) + '...')

        // Enviar chunks por WhatsApp
        for (let i = 0; i < chunks.length; i++) {
          const chunkMessage = `Parte ${i + 1}/${chunks.length}:\n\n${chunks[i]}`
          await this.sendNotification(
            scrapingMessage.requestId,
            scrapingMessage.userId,
            chunkMessage,
          )

          // Pequeña pausa entre chunks
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
      }

      this.channel.ack(message)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Error processing message: ${errorMessage}`)

      this.channel.nack(message, false, true) // Reintentar
    }
  }

  /**
   * Envía una notificación a través del queue
   */
  private async sendNotification(requestId: string, userId: string, message: string): Promise<void> {
    if (!this.channel) {
      return
    }

    const notificationPayload = {
      requestId,
      userId,
      message,
      timestamp: new Date().toISOString(),
    }

    this.channel.sendToQueue(
      this.notificationQueue,
      Buffer.from(JSON.stringify(notificationPayload)),
      { persistent: true },
    )

    this.logger.debug(`Notification queued for user ${userId}`)
  }

  /**
   * Cierra la conexión
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
}
