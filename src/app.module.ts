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
 * - RabbitMQModule: Global RabbitMQ service (all inter-service communication)
 * - QueueModule: Queue listeners with all services (ScrapingListener handles both scraping tasks + Notion responses)
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

    // Queue listeners with all services they need
    QueueModule,
  ],

  providers: [
    // ========== Utilities ==========
    RateLimiter,
  ],
})
export class AppModule {}
