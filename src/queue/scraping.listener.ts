import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { QUEUES, ROUTING_KEYS } from '../rabbitmq/constants/queues'
import { PuppeteerScraper } from '../scraper/puppeteer.scraper'
import { SummaryService } from '../utils/summary.service'
import { DataCleanupService } from '../utils/data-cleanup.service'
import { GatewayClient } from '../http/gateway.client'
import { ScrapingMessage } from '../common/types'

/**
 * Consolidated Scraping Listener
 * 
 * SIMPLIFIED ARCHITECTURE:
 * Scraping Service is now DECOUPLED from other microservices.
 * All communication goes through Gateway via HTTP (not RabbitMQ).
 *
 * FLOW 1: Scraping Tasks
 * - Listens on: scraping.task queue (RabbitMQ)
 * - Process: Scrape URL → Clean data → HTTP POST to Gateway → Generate summary
 * - Gateway handles: Publishing to Notion, receiving responses, sending WhatsApp
 *
 * FLOW 2: Notion Responses (REMOVED)
 * - No longer listening for Notion responses
 * - Gateway listener handles WhatsApp notifications
 *
 * NOTE: Simplified from 2 listeners to 1
 * Follows microservices principle: each service has single responsibility
 * 
 * ✨ CHANGES:
 * - Removed: NotificationService (now in Gateway)
 * - Added: GatewayClient for HTTP communication
 * - Removed: FLOW 2 listener
 * - Simplified: No WhatsApp sending in scraping service
 */
@Injectable()
export class ScrapingListener implements OnModuleInit {
  private readonly logger = new Logger(ScrapingListener.name)

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly scraper: PuppeteerScraper,
    private readonly summaryService: SummaryService,
    private readonly dataCleanupService: DataCleanupService,
    private readonly gatewayClient: GatewayClient,
    private readonly configService: ConfigService,
  ) {
    this.logger.log(`ScrapingListener initialized`)
  }

  /**
   * Auto-subscribe to scraping tasks queue when module initializes
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

      this.logger.log('✅ ScrapingListener initialized successfully - Waiting for scraping tasks...')
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
   * 3. Send cleaned data to Gateway (asynchronously)
   * 4. Generate AI summary
   * 5. That's it! Gateway handles everything else (Notion, WhatsApp)
   *
   * NOTE: All communication with other services is now via Gateway
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
        // Don't send notification - Gateway would have handled it if enabled
        throw new Error(`Scraping failed: ${result.error}`)
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

      // ========== STEP 3: Send to Gateway (via HTTP) ==========
      // Gateway will handle: Publishing to Notion, listening for responses, sending WhatsApp
      try {
        this.logger.log(`📤 STEP 3: Sending cleaned data to Gateway...`)
        this.logger.log(`   - cleanedData keys: ${Object.keys(cleanedData).join(', ')}`)
        this.logger.log(`   - cleanedData.title: ${cleanedData.title}`)
        this.logger.log(`   - sections count: ${cleanedData.sections?.length || 0}`)
        this.logger.log(`   - links count: ${cleanedData.links?.length || 0}`)

        const gatewayResponse = await this.gatewayClient.notifyNotion({
          userId: scrapingMessage.userId,
          title: cleanedData.title || 'Scraping Result',
          url: scrapingMessage.url,
          data: cleanedData,
        })

        if (gatewayResponse) {
          this.logger.log(`✅ Gateway accepted notification`)
          this.logger.log(`   - requestId: ${gatewayResponse.requestId}`)
          this.logger.log(`   - message: ${gatewayResponse.message}`)
        } else {
          this.logger.error(`⚠️ Gateway notification failed (see GatewayClient logs for details)`)
          // Don't throw - continue with summary generation
        }
      } catch (gatewayError) {
        const err = gatewayError instanceof Error ? gatewayError.message : String(gatewayError)
        this.logger.error(`❌ STEP 3 FAILED: Failed to notify Gateway`)
        this.logger.error(`   - error: ${err}`)
        this.logger.error(`   - userId: ${scrapingMessage.userId}`)
        this.logger.error(`   - title: ${cleanedData.title}`)
        // Continue anyway - summary will still be generated
      }

      // ========== STEP 4: Generate summary ==========
      // NOTE: WhatsApp sending is now handled by Gateway
      this.logger.log(`📝 STEP 4: Generating AI summary...`)
      const summary = this.summaryService.summarizeWithHeader(cleanedData as any, scrapingMessage.url)
      const chunks = this.summaryService.chunk(summary)

      this.logger.log(`📝 Generated summary: ${chunks.length} chunks`)
      this.logger.log(`   - total characters: ${summary.length}`)

      // ========== STEP 5: Complete ==========
      this.logger.log(
        `✅ Scraping task completed successfully | requestId=${scrapingMessage.requestId}, user=${scrapingMessage.userId}`,
      )
      this.logger.log(`   - Gateway will handle: Notion page creation, WhatsApp notification`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `❌ Error processing scraping task (${scrapingMessage.requestId}): ${msg}`,
      )
      throw error // Re-throw so RabbitMQ can nack and handle retry
    }
  }
}
