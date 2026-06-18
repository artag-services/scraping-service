import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INotificationAdapter } from '../../domain/ports/INotificationAdapter';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';

@Injectable()
export class NotionNotificationAdapter implements INotificationAdapter {
  readonly name = 'notion';
  private readonly logger = new Logger(NotionNotificationAdapter.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly config: ConfigService,
  ) {}

  async send(userId: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const parentPageId = this.config.get<string>('NOTION_PARENT_PAGE_ID');
    await this.rabbitmq.publish('channels.notion.send', {
      messageId: metadata?.jobId ?? `notify-${Date.now()}`,
      operation: 'create_page',
      message,
      metadata: {
        parent_page_id: parentPageId,
        title: metadata?.title ?? message,
        icon: '🔗',
        url: metadata?.url,
        userId,
        scrapedData: metadata?.data,
      },
    });
    this.logger.log(`Notion notification sent for user ${userId}`);
  }
}
