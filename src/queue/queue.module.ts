import { Module } from '@nestjs/common'
import { ScrapingListener } from './scraping.listener'
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module'
import { PuppeteerScraper } from '../scraper/puppeteer.scraper'
import { AutoScraper } from '../scraper/auto-scraper'
import { BrowserPool } from '../scraper/browser-pool'
import { SessionModule } from '../sessions/session.module'
import { JobsModule } from '../jobs/jobs.module'

/**
 * Wires the scraping pipeline:
 *  - BrowserPool (page-based pool)
 *  - AutoScraper (heuristic extractor)
 *  - PuppeteerScraper (strategy executor)
 *  - ScrapingListener (RabbitMQ consumer + lifecycle event publisher)
 *
 * Removed: GatewayClient + SummaryService + DataCleanupService — the new
 * pipeline publishes raw results to channels.scraping.events.completed; any
 * downstream cleanup/summarization belongs in the consumer (gateway SSE
 * bridge, notion-service, etc.), not here.
 */
@Module({
  imports: [RabbitMQModule, SessionModule, JobsModule],
  providers: [BrowserPool, AutoScraper, PuppeteerScraper, ScrapingListener],
})
export class QueueModule {}
