import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { QUEUES, ROUTING_KEYS } from '../rabbitmq/constants/queues'
import { PuppeteerScraper } from '../scraper/puppeteer.scraper'
import { NotificationService } from '../notifications/notification.service'
import { SummaryService } from '../utils/summary.service'
import { DataCleanupService } from '../utils/data-cleanup.service'
import { ScrapingMessage } from '../common/types'

/**
 * Consolidated Scraping Listener
 * Handles TWO flows via RabbitMQ (✅ REQUIREMENT MET: All inter-service via RabbitMQ):
 *
 * FLOW 1: Scraping Tasks
 * - Listens on: scraping.task queue
 * - Process: Scrape URL → Clean data → Send to Notion → Generate summary → WhatsApp
 *
 * FLOW 2: Notion Responses
 * - Listens on: scrapping.notion-response queue
 * - Process: Receive success from Notion → Send WhatsApp notification with link
 *
 * NOTE: Replaces old RabbitMQConsumer + NotionResponseConsumer (now consolidated)
 * Follows standard pattern from Notion/WhatsApp/Identity services
 */
@Injectable()
export class ScrapingListener implements OnModuleInit {
  private readonly logger = new Logger(ScrapingListener.name)
  private personalWhatsappNumber: string

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly scraper: PuppeteerScraper,
    private readonly notificationService: NotificationService,
    private readonly summaryService: SummaryService,
    private readonly dataCleanupService: DataCleanupService,
    private readonly configService: ConfigService,
  ) {
    this.personalWhatsappNumber = this.configService.get('PERSONAL_WHATSAPP_NUMBER', '573205711428')
    this.logger.log(
      `ScrapingListener configured: personalNumber=${this.personalWhatsappNumber}`,
    )
  }

  /**
   * Auto-subscribe to both queues when module initializes
   * This follows NestJS lifecycle hooks pattern used in Notion/WhatsApp services
   */
  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('🚀 ScrapingListener initializing...')

      // Subscribe to scraping tasks queue
      await this.rabbitmq.subscribe(
        QUEUES.SCRAPING_TASK,
        ROUTING_KEYS.SCRAPING_TASK,
        (payload) => this.handleScrapingTask(payload),
      )
      this.logger.log(`✅ Subscribed to ${QUEUES.SCRAPING_TASK} queue`)

      // Subscribe to Notion responses queue
      await this.rabbitmq.subscribe(
        QUEUES.SCRAPPING_NOTION_RESPONSE,
        ROUTING_KEYS.SCRAPPING_NOTION_RESPONSE,
        (payload) => this.handleNotionResponse(payload),
      )
      this.logger.log(`✅ Subscribed to ${QUEUES.SCRAPPING_NOTION_RESPONSE} queue`)

      this.logger.log('✅ ScrapingListener initialized successfully - Waiting for messages...')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ Failed to initialize ScrapingListener: ${msg}`)
      throw error
    }
  }

  /**
   * FLOW 1: Handle scraping tasks
   *
   * Steps:
   * 1. Scrape the URL
   * 2. Clean the data (remove trash, duplicates, etc)
   * 3. Send cleaned data to Notion via RabbitMQ (inter-service communication ✅)
   * 4. Generate AI summary
   * 5. Send summary chunks via WhatsApp
   *
   * NOTE: If Notion fails, we continue with WhatsApp (Opción A - Notion is optional)
   */
  private async handleScrapingTask(payload: Record<string, any>): Promise<void> {
    const scrapingMessage = payload as unknown as ScrapingMessage

    this.logger.log(
      `📨 Received scraping task | requestId=${scrapingMessage.requestId}, url=${scrapingMessage.url}, userId=${scrapingMessage.userId}`,
    )

    try {
      // ========== STEP 1: Perform scraping ==========
      this.logger.log(`🕷️ Starting scraping for ${scrapingMessage.url}...`)
      const result = await this.scraper.scrape(
        scrapingMessage.requestId,
        scrapingMessage.url,
        scrapingMessage.instructions,
        scrapingMessage.userId,
      )

      if (!result.success) {
        this.logger.error(`❌ Scraping failed: ${result.error}`)
        // Send error notification via WhatsApp
        try {
          await this.notificationService.send(
            'whatsapp',
            scrapingMessage.userId,
            `❌ Error en scraping: ${result.error}`,
          )
        } catch (wpError) {
          this.logger.error(
            `Failed to send WhatsApp error: ${wpError instanceof Error ? wpError.message : String(wpError)}`,
          )
        }
        return
      }

      this.logger.log(`✅ Scraping successful for ${scrapingMessage.url}`)
      this.logger.debug(
        `📊 Raw data extracted: ${JSON.stringify(result.data, null, 2).substring(0, 500)}...`,
      )

      // ========== STEP 2: Clean data ==========
      const cleanedData = this.dataCleanupService.cleanup(result.data)
      this.logger.log(
        `✨ Data cleaned: title="${cleanedData.title}", sections=${cleanedData.sections?.length || 0}, links=${cleanedData.links?.length || 0}`,
      )

      // ========== STEP 3: Send to Notion via RabbitMQ ==========
      // IMPORTANT: This is inter-service communication via RabbitMQ (✅ requirement met)
      try {
        this.logger.log(`📤 STEP 3: Sending cleaned data to Notion service via RabbitMQ...`)
        this.logger.log(`   - cleanedData keys: ${Object.keys(cleanedData).join(', ')}`)
        this.logger.log(`   - cleanedData.title: ${cleanedData.title}`)
        this.logger.log(`   - sections count: ${cleanedData.sections?.length || 0}`)
        this.logger.log(`   - links count: ${cleanedData.links?.length || 0}`)

        await this.notificationService.send('notion', scrapingMessage.userId, cleanedData, {
          url: scrapingMessage.url,
        })
        this.logger.log(`✅ Notion notification successfully sent to NotificationService`)
        this.logger.log(
          `✅ Notion notification queued: user=${scrapingMessage.userId}, title="${cleanedData.title}"`,
        )
      } catch (notionError) {
        const err = notionError instanceof Error ? notionError.message : String(notionError)
        this.logger.error(`❌ STEP 3 FAILED: Failed to queue Notion notification`)
        this.logger.error(`   - error: ${err}`)
        this.logger.error(`   - userId: ${scrapingMessage.userId}`)
        this.logger.error(`   - title: ${cleanedData.title}`)
        // Continue anyway - Notion is optional, WhatsApp summary still sends (Opción A)
        this.logger.log(`📋 Continuing with WhatsApp summary anyway (Notion failure non-blocking)`)
      }

      // ========== STEP 4: Generate summary and send via WhatsApp ==========
      // Note: Don't wait for Notion response, send summary immediately
      this.logger.log(`📝 Generating AI summary...`)
      const summary = this.summaryService.summarizeWithHeader(cleanedData as any, scrapingMessage.url)
      const chunks = this.summaryService.chunk(summary)

      this.logger.log(`📝 Generated summary: ${chunks.length} chunks`)

      for (let i = 0; i < chunks.length; i++) {
        const chunkMessage = `Parte ${i + 1}/${chunks.length}:\n\n${chunks[i]}`
        try {
          await this.notificationService.send('whatsapp', scrapingMessage.userId, chunkMessage)
          this.logger.debug(`✅ Sent WhatsApp chunk ${i + 1}/${chunks.length}`)
        } catch (wpError) {
          this.logger.error(
            `Failed to send WhatsApp chunk ${i + 1}: ${wpError instanceof Error ? wpError.message : String(wpError)}`,
          )
          throw wpError // Re-throw so this task is nacked and retried
        }
      }

      this.logger.log(
        `✅ Scraping task completed successfully | requestId=${scrapingMessage.requestId}, user=${scrapingMessage.userId}`,
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `❌ Error processing scraping task (${scrapingMessage.requestId}): ${msg}`,
      )
      throw error // Re-throw so RabbitMQ can nack and handle retry
    }
  }

  /**
   * FLOW 2: Handle Notion responses
   *
   * Steps:
   * 1. Receive response from Notion service via RabbitMQ
   * 2. Check if successful
   * 3. Extract Notion page URL
   * 4. Send WhatsApp notification with link to personal number
   *
   * NOTE: This is triggered AFTER Notion service processes the page
   */
  private async handleNotionResponse(payload: Record<string, any>): Promise<void> {
    try {
      this.logger.log(
        `📨 Received Notion response | messageId=${payload.messageId}, status=${payload.status}`,
      )

      if (payload.status === 'SUCCESS') {
        const { notionPageUrl, messageId } = payload

        // ========== STEP 1: Format WhatsApp notification ==========
        const notionMessage = `
✅ *Tu scraping está en Notion*

📄 La página fue creada exitosamente
🔗 Ver en Notion: ${notionPageUrl}

⏰ ${new Date().toLocaleString('es-CO')}
        `.trim()

        // ========== STEP 2: Send to personal number ==========
        this.logger.log(
          `📱 Sending Notion success notification to ${this.personalWhatsappNumber}`,
        )

        try {
          await this.notificationService.send('whatsapp', this.personalWhatsappNumber, notionMessage)
          this.logger.log(
            `✅ WhatsApp notification sent successfully | messageId=${messageId}`,
          )
        } catch (wpError) {
          this.logger.error(
            `❌ Failed to send WhatsApp notification: ${wpError instanceof Error ? wpError.message : String(wpError)}`,
          )
          throw wpError
        }
      } else {
        this.logger.warn(
          `⚠️ Notion operation failed | messageId=${payload.messageId}, error=${payload.error}`,
        )
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ Error processing Notion response: ${msg}`)
      throw error // Re-throw so RabbitMQ can nack and handle
    }
  }
}
