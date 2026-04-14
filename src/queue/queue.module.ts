import { Module } from '@nestjs/common'
import { ScrapingListener } from './scraping.listener'
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module'
import { PuppeteerScraper } from '../scraper/puppeteer.scraper'
import { AutoScraper } from '../scraper/auto-scraper'
import { BrowserPool } from '../scraper/browser-pool'
import { SummaryService } from '../utils/summary.service'
import { DataCleanupService } from '../utils/data-cleanup.service'
import { GatewayClient } from '../http/gateway.client'

/**
 * Queue Module
 * Registers all queue listeners/consumers for the scraping service
 *
 * Currently contains:
 * - ScrapingListener: Handles scraping tasks and Notion responses
 *
 * Imports all necessary dependencies so ScrapingListener can be instantiated
 * 
 * ✨ REMOVED: NotificationService and all adapters
 *    Now using GatewayClient to communicate via HTTP
 */
@Module({
  imports: [RabbitMQModule],
  providers: [
    // Core scrapers (in dependency order)
    BrowserPool,
    AutoScraper,
    PuppeteerScraper,

    // HTTP Client for Gateway communication
    GatewayClient,

    // Utilities
    SummaryService,
    DataCleanupService,

    // Listeners
    ScrapingListener,
  ],
})
export class QueueModule {}
