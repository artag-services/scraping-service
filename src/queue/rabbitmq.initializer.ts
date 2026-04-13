// src/queue/rabbitmq.initializer.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { RabbitMQConsumer } from './rabbitmq.consumer'

@Injectable()
export class RabbitMQInitializer implements OnModuleInit {
  private readonly logger = new Logger(RabbitMQInitializer.name)

  constructor(private rabbitMQConsumer: RabbitMQConsumer) {}

  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('🚀 Initializing RabbitMQ Consumer...')
      await this.rabbitMQConsumer.onModuleInit()
      this.logger.log('✅ RabbitMQ Consumer initialized successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`❌ Failed to initialize RabbitMQ Consumer: ${errorMessage}`)
      throw error
    }
  }
}
