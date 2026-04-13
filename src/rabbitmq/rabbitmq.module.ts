import { Global, Module } from '@nestjs/common'
import { RabbitMQService } from './rabbitmq.service'

/**
 * Global RabbitMQ Module
 * Provides RabbitMQService to all other modules in the application
 * Follows standard pattern from Notion, WhatsApp, Identity services
 *
 * Usage: Import RabbitMQModule in any module to access RabbitMQService
 * No need to import in each module since it's @Global()
 */
@Global()
@Module({
  providers: [RabbitMQService],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}
