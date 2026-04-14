// src/app.module.ts

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

// RabbitMQ (Global)
import { RabbitMQModule } from './rabbitmq/rabbitmq.module'

// Queue Listeners
import { QueueModule } from './queue/queue.module'

// Utilities
import { RateLimiter } from './rate-limit/rate-limiter'

/**
 * App Module
 *
 * Architecture:
 * - ConfigModule: Global config (environment variables)
 * - RabbitMQModule: Global RabbitMQ service (for listening to scraping tasks)
 * - QueueModule: Queue listeners and all services (ScrapingListener handles scraping tasks)
 *
 * ✨ SIMPLIFIED: Removed all notification adapters and services
 *    Now uses GatewayClient to communicate with Gateway via HTTP
 *    All inter-service communication flows through Gateway
 *
 * ✅ Scraping service now fully decoupled from other services
 * ✅ Single point of integration: Gateway via HTTP
 */
@Module({
  imports: [
    // Config (global, processed first)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // RabbitMQ (global, available to all modules)
    // Only used for listening to scraping tasks
    RabbitMQModule,

    // Queue listeners with all services they need
    QueueModule,
  ],

  providers: [
    // ========== Utilities ==========
    RateLimiter,
  ],
})
export class AppModule {}
