import { Module } from '@nestjs/common'
import { ScrapingListener } from './scraping.listener'

/**
 * Queue Module
 * Registers all queue listeners/consumers for the scraping service
 *
 * Currently contains:
 * - ScrapingListener: Handles scraping tasks and Notion responses
 *
 * Can be extended with more listeners as needed
 */
@Module({
  providers: [ScrapingListener],
})
export class QueueModule {}
