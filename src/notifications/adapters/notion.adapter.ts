import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { v4 as uuid } from 'uuid'
import { NotificationAdapter } from '../interfaces/notification-adapter.interface'
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service'

@Injectable()
export class NotionAdapter implements NotificationAdapter {
  private readonly logger = new Logger(NotionAdapter.name)

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly config: ConfigService,
  ) {}

  getName(): string {
    return 'notion'
  }

  /**
   * Send cleaned scraping result to Notion service via RabbitMQ
   */
  async send(
    userId: string,
    message: any,
    options?: Record<string, any>,
  ): Promise<void> {
    try {
      const messageId = `scraping-${uuid()}`
      const notionIntegrationToken = this.config.get('NOTION_INTEGRATION_TOKEN')

      // Only send if Notion is configured
      if (!notionIntegrationToken) {
        const error = 'NOTION_INTEGRATION_TOKEN not configured - cannot send to Notion'
        this.logger.error(error)
        throw new Error(error)  // ✨ CHANGED: Throw instead of silent return
      }

      // ✨ LOG: Data received from scraping service
      this.logger.log(`📨 NotionAdapter.send() RECEIVED data from scraping service:`)
      this.logger.log(`   - userId: ${userId}`)
      this.logger.log(`   - message type: ${typeof message}`)
      this.logger.log(`   - message keys: ${message ? Object.keys(message).join(', ') : 'N/A'}`)
      this.logger.log(`   - options: ${JSON.stringify(options)}`)

      // Prepare payload for Notion service
      const payload = {
        messageId,
        operation: 'create_page',
        message: typeof message === 'string' ? message : JSON.stringify(message),
        metadata: {
          parent_page_id:
            options?.parentPageId || this.config.get('NOTION_PARENT_PAGE_ID') || this.config.get('NOTION_DATABASE_ID'),
          title: message?.title || 'Scraping Result',
          icon: '🔗',
          userId,
          url: options?.url,
          timestamp: new Date().toISOString(),
        },
      }

      // ✨ LOG: Payload prepared before sending
      this.logger.log(`✨ TRANSFORMED PAYLOAD ready to send to RabbitMQ:`)
      this.logger.log(`   - messageId: ${payload.messageId}`)
      this.logger.log(`   - operation: ${payload.operation}`)
      this.logger.log(`   - title: ${payload.metadata.title}`)
      this.logger.log(`   - userId: ${payload.metadata.userId}`)
      this.logger.log(`   - url: ${payload.metadata.url}`)
      this.logger.log(`   - parent_page_id: ${payload.metadata.parent_page_id}`)
      this.logger.log(`   - message length: ${payload.message.length} chars`)

      // ✨ LOG: About to publish to RabbitMQ
      this.logger.log(`🚀 PUBLISHING to RabbitMQ: routingKey="channels.notion.send", messageId=${messageId}`)

      // Publish to Notion service queue
      await this.rabbitmq.publish('channels.notion.send', payload)

      // ✨ LOG: Success confirmation
      this.logger.log(`✅ SUCCESS: Notion notification PUBLISHED to RabbitMQ`)
      this.logger.log(`   - messageId: ${messageId}`)
      this.logger.log(`   - userId: ${userId}`)
      this.logger.log(`   - url: ${options?.url}`)
      this.logger.log(`   - routingKey: channels.notion.send`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const stackTrace = error instanceof Error ? error.stack : ''
      this.logger.error(`❌ ERROR in NotionAdapter.send():`)
      this.logger.error(`   - errorMessage: ${errorMessage}`)
      this.logger.error(`   - stackTrace: ${stackTrace}`)
      throw error
    }
  }

  /**
   * Check if Notion adapter is available
   */
  async isAvailable(userId: string): Promise<boolean> {
    const token = this.config.get('NOTION_INTEGRATION_TOKEN')
    return !!token
  }

  /**
   * Validate Notion configuration
   */
  async validate(): Promise<boolean> {
    return this.isAvailable('system')
  }
}
