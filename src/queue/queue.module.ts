import { Module } from '@nestjs/common'
import { ScrapingListener } from './scraping.listener'
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module'
import { PuppeteerScraper } from '../scraper/puppeteer.scraper'
import { AutoScraper } from '../scraper/auto-scraper'
import { BrowserPool } from '../scraper/browser-pool'
import { NotificationService } from '../notifications/notification.service'
import { WhatsAppAdapter } from '../notifications/adapters/whatsapp.adapter'
import { EmailAdapter } from '../notifications/adapters/email.adapter'
import { NotionAdapter } from '../notifications/adapters/notion.adapter'
import { SummaryService } from '../utils/summary.service'
import { DataCleanupService } from '../utils/data-cleanup.service'

/**
 * Queue Module
 * Registers all queue listeners/consumers for the scraping service
 *
 * Currently contains:
 * - ScrapingListener: Handles scraping tasks and Notion responses
 *
 * Imports all necessary dependencies so ScrapingListener can be instantiated
 */
@Module({
  imports: [RabbitMQModule],
  providers: [
    // Core scrapers (in dependency order)
    BrowserPool,
    AutoScraper,
    PuppeteerScraper,

    // Notification adapters
    WhatsAppAdapter,
    EmailAdapter,
    NotionAdapter,

    // Notification service with adapter injection
    {
      provide: NotificationService,
      useFactory: (whatsappAdapter: WhatsAppAdapter, emailAdapter: EmailAdapter, notionAdapter: NotionAdapter) => {
        return new NotificationService([whatsappAdapter, emailAdapter, notionAdapter])
      },
      inject: [WhatsAppAdapter, EmailAdapter, NotionAdapter],
    },

    // Utilities
    SummaryService,
    DataCleanupService,

    // Listeners
    ScrapingListener,
  ],
})
export class QueueModule {}
