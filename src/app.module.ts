// src/app.module.ts

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

// RabbitMQ (Global)
import { RabbitMQModule } from './rabbitmq/rabbitmq.module'

// Queue Listeners
import { QueueModule } from './queue/queue.module'

// Core Services
import { BrowserPool } from './scraper/browser-pool'
import { AutoScraper } from './scraper/auto-scraper'
import { PuppeteerScraper } from './scraper/puppeteer.scraper'

// Notifications
import { NotificationService } from './notifications/notification.service'
import { WhatsAppAdapter } from './notifications/adapters/whatsapp.adapter'
import { EmailAdapter } from './notifications/adapters/email.adapter'
import { NotionAdapter } from './notifications/adapters/notion.adapter'

// Utilities
import { SummaryService } from './utils/summary.service'
import { DataCleanupService } from './utils/data-cleanup.service'
import { RateLimiter } from './rate-limit/rate-limiter'

/**
 * App Module
 *
 * Architecture:
 * - ConfigModule: Global config (environment variables)
 * - RabbitMQModule: Global RabbitMQ service (all inter-service communication)
 * - QueueModule: Queue listeners (ScrapingListener handles both scraping tasks + Notion responses)
 * - Providers: Services and adapters
 *
 * ✨ NOTIFICATION ADAPTERS: NotificationService now implements OnModuleInit and auto-registers
 *    all adapters passed in constructor. This ensures adapters are available before any service uses them.
 *
 * ✅ All inter-service communication via RabbitMQ (requirement met)
 * ✅ Follows standard pattern from Notion/WhatsApp/Identity services
 */
@Module({
  imports: [
    // Config (global, processed first)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // RabbitMQ (global, available to all modules)
    // Handles all inter-service communication
    RabbitMQModule,

    // Queue listeners (auto-subscribe on module init)
    QueueModule,
  ],

  providers: [
    // ========== Scrapers ==========
    BrowserPool,
    AutoScraper,
    PuppeteerScraper,

    // ========== Notification Adapters ==========
    // These are provided first so they can be injected into NotificationService
    WhatsAppAdapter,
    EmailAdapter,
    NotionAdapter,

    // ========== Notifications System ==========
    // ✨ IMPROVED: NotificationService now gets adapters via constructor
    // and automatically registers them on module init
    {
      provide: NotificationService,
      useFactory: (whatsappAdapter: WhatsAppAdapter, emailAdapter: EmailAdapter, notionAdapter: NotionAdapter) => {
        return new NotificationService([whatsappAdapter, emailAdapter, notionAdapter])
      },
      inject: [WhatsAppAdapter, EmailAdapter, NotionAdapter],
    },

    // ========== Utilities ==========
    SummaryService,
    DataCleanupService,
    RateLimiter,
  ],
})
export class AppModule {}
