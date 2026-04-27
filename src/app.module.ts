import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { PrismaModule } from './prisma/prisma.module'
import { RedisModule } from './redis/redis.module'
import { RabbitMQModule } from './rabbitmq/rabbitmq.module'
import { QueueModule } from './queue/queue.module'
import { RateLimiter } from './rate-limit/rate-limiter'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Global infra
    PrismaModule,    // ScrapingJob persistence
    RedisModule,     // session cache
    RabbitMQModule,  // event bus

    // Pipeline
    QueueModule,
  ],
  providers: [RateLimiter],
})
export class AppModule {}
