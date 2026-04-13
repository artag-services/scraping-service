// src/app.module.ts

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PuppeteerScraper } from './scraper/puppeteer.scraper'
import { BrowserPool } from './scraper/browser-pool'
import { AutoScraper } from './scraper/auto-scraper'
import { RabbitMQConsumer } from './queue/rabbitmq.consumer'
import { RabbitMQInitializer } from './queue/rabbitmq.initializer'
import { NotificationService } from './notifications/notification.service'
import { WhatsAppAdapter } from './notifications/adapters/whatsapp.adapter'
import { EmailAdapter } from './notifications/adapters/email.adapter'
import { SummaryService } from './utils/summary.service'
import { RateLimiter } from './rate-limit/rate-limiter'

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
    SummaryService,
    RateLimiter,
    RabbitMQConsumer,
    RabbitMQInitializer,
    {
      provide: 'NOTIFICATION_SERVICE',
      useFactory: (notificationService: NotificationService, whatsappAdapter: WhatsAppAdapter, emailAdapter: EmailAdapter) => {
        notificationService.registerAdapter(whatsappAdapter)
        notificationService.registerAdapter(emailAdapter)
        return notificationService
      },
      inject: [NotificationService, WhatsAppAdapter, EmailAdapter],
    },
  ],
})
export class AppModule {
  constructor(private rabbitmqInitializer: RabbitMQInitializer) {
    console.log('✓ AppModule constructor - RabbitMQInitializer injected')
  }
}
