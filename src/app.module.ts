import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { AdminModule } from './admin/admin.module';

// Infrastructure adapters
import { RustScraperPool } from './infrastructure/browser/rust-scraper-pool';
import { PrismaJobRepository } from './infrastructure/persistence/prisma-job.repository';
import { RabbitMQEventPublisher } from './infrastructure/messaging/rabbitmq-event-publisher';
import { RabbitMQOutputDispatcher } from './infrastructure/messaging/rabbitmq-output-dispatcher';
import { RedisSessionManager } from './infrastructure/session/redis-session-manager';
import { RedisCacheService } from './infrastructure/cache/redis-cache.service';
import { NotionNotificationAdapter } from './infrastructure/notifications/notion.adapter';
import { WhatsAppNotificationAdapter } from './infrastructure/notifications/whatsapp.adapter';
import { EmailNotificationAdapter } from './infrastructure/notifications/email.adapter';

// Scraper
import { AutoScraper } from './scraper/auto-scraper';

// Domain services
import { ExecuteScrapingUseCase } from './domain/services/execute-scraping.usecase';
import { ManageJobUseCase } from './domain/services/manage-job.usecase';
import { NotificationAdapterRegistry } from './domain/services/notification-adapter.registry';

// Port tokens
import { IBrowserPool } from './domain/ports/IBrowserPool';
import { IJobRepository } from './domain/ports/IJobRepository';
import { IEventPublisher } from './domain/ports/IEventPublisher';
import { IOutputDispatcher } from './domain/ports/IOutputDispatcher';
import { ICacheService } from './domain/ports/ICacheService';
import { ISessionManager } from './domain/ports/ISessionManager';
import { IAutoScraper } from './domain/ports/IAutoScraper';
import { INotificationAdapter } from './domain/ports/INotificationAdapter';

// Application consumers
import { ScrapingTaskConsumer } from './application/consumers/scraping-task.consumer';
import { RpcConsumer } from './application/consumers/rpc.consumer';
import { NotionResponseConsumer } from './application/consumers/notion-response.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    RedisModule,
    RabbitMQModule,
    AdminModule,
  ],
  providers: [
    AutoScraper,

    // ── Port → Adapter bindings ──
    { provide: 'IBrowserPool', useClass: RustScraperPool },
    { provide: 'IJobRepository', useClass: PrismaJobRepository },
    { provide: 'IEventPublisher', useClass: RabbitMQEventPublisher },
    { provide: 'IOutputDispatcher', useClass: RabbitMQOutputDispatcher },
    { provide: 'ISessionManager', useClass: RedisSessionManager },
    { provide: 'IAutoScraper', useClass: AutoScraper },
    { provide: 'ICacheService', useClass: RedisCacheService },

    // Notification adapters (registered with their own token + multi: true)
    NotionNotificationAdapter,
    WhatsAppNotificationAdapter,
    EmailNotificationAdapter,
    {
      provide: 'INotificationAdapters',
      useFactory: (
        notion: NotionNotificationAdapter,
        whatsapp: WhatsAppNotificationAdapter,
        email: EmailNotificationAdapter,
      ): INotificationAdapter[] => [notion, whatsapp, email],
      inject: [NotionNotificationAdapter, WhatsAppNotificationAdapter, EmailNotificationAdapter],
    },

    // ── Domain services ──
    {
      provide: NotificationAdapterRegistry,
      useFactory: (adapters: INotificationAdapter[]) => new NotificationAdapterRegistry(adapters),
      inject: ['INotificationAdapters'],
    },
    {
      provide: ManageJobUseCase,
      useFactory: (jobRepo: IJobRepository, eventPub: IEventPublisher) =>
        new ManageJobUseCase(jobRepo, eventPub),
      inject: ['IJobRepository', 'IEventPublisher'],
    },
    {
      provide: ExecuteScrapingUseCase,
      useFactory: (
        browserPool: IBrowserPool,
        jobRepo: IJobRepository,
        eventPub: IEventPublisher,
        outputDispatcher: IOutputDispatcher,
        cacheService: ICacheService,
        registry: NotificationAdapterRegistry,
        config: ConfigService,
        sessionManager?: ISessionManager,
        autoScraper?: IAutoScraper,
      ) =>
        new ExecuteScrapingUseCase(
          browserPool,
          jobRepo,
          eventPub,
          outputDispatcher,
          cacheService,
          registry,
          Number(config.get('SCRAPING_TIMEOUT', 60_000)),
          sessionManager,
          autoScraper,
        ),
      inject: [
        'IBrowserPool',
        'IJobRepository',
        'IEventPublisher',
        'IOutputDispatcher',
        'ICacheService',
        NotificationAdapterRegistry,
        ConfigService,
        { token: 'ISessionManager', optional: true },
        { token: 'IAutoScraper', optional: true },
      ],
    },

    // ── Application consumers ──
    ScrapingTaskConsumer,
    RpcConsumer,
    NotionResponseConsumer,
  ],
})
export class AppModule {}
