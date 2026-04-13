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
        this.logger.warn('NOTION_INTEGRATION_TOKEN not configured, skipping Notion notification')
        return
      }

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

      // Publish to Notion service queue
      await this.rabbitmq.publish('channels.notion.send', payload)

      this.logger.log(`Notion notification queued: messageId=${messageId}, userId=${userId}, url=${options?.url}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const stackTrace = error instanceof Error ? error.stack : ''
      this.logger.error(`Failed to queue Notion notification: ${errorMessage}`, stackTrace)
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
