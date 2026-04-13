// src/app.module.ts

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PuppeteerScraper } from './scraper/puppeteer.scraper'
import { BrowserPool } from './scraper/browser-pool'
import { AutoScraper } from './scraper/auto-scraper'
import { RabbitMQConsumer } from './queue/rabbitmq.consumer'
import { NotionResponseConsumer } from './queue/notion-response.consumer'
import { RabbitMQInitializer } from './queue/rabbitmq.initializer'
import { NotificationService } from './notifications/notification.service'
import { WhatsAppAdapter } from './notifications/adapters/whatsapp.adapter'
import { EmailAdapter } from './notifications/adapters/email.adapter'
import { NotionAdapter } from './notifications/adapters/notion.adapter'
import { SummaryService } from './utils/summary.service'
import { DataCleanupService } from './utils/data-cleanup.service'
import { RateLimiter } from './rate-limit/rate-limiter'
import { RabbitMQService } from './rabbitmq/rabbitmq.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  providers: [
    BrowserPool,
    AutoScraper,
    PuppeteerScraper,
    NotificationService,
    WhatsAppAdapter,
    EmailAdapter,
    NotionAdapter,
    SummaryService,
    DataCleanupService,
    RateLimiter,
    RabbitMQService,
    RabbitMQConsumer,
    NotionResponseConsumer,
    RabbitMQInitializer,
    {
      provide: 'NOTIFICATION_SERVICE',
      useFactory: (notificationService: NotificationService, whatsappAdapter: WhatsAppAdapter, emailAdapter: EmailAdapter, notionAdapter: NotionAdapter) => {
        notificationService.registerAdapter(whatsappAdapter)
        notificationService.registerAdapter(emailAdapter)
        notificationService.registerAdapter(notionAdapter)
        return notificationService
      },
      inject: [NotificationService, WhatsAppAdapter, EmailAdapter, NotionAdapter],
    },
  ],
})
export class AppModule {
  constructor(private rabbitmqInitializer: RabbitMQInitializer) {
    console.log('✓ AppModule constructor - RabbitMQInitializer injected')
  }
}
