import { Injectable, Logger } from '@nestjs/common';
import { INotificationAdapter } from '../../domain/ports/INotificationAdapter';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';

@Injectable()
export class EmailNotificationAdapter implements INotificationAdapter {
  readonly name = 'email';
  private readonly logger = new Logger(EmailNotificationAdapter.name);

  constructor(private readonly rabbitmq: RabbitMQService) {}

  async send(userId: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const to = metadata?.to as string[] ?? [userId];
    await this.rabbitmq.publish('channels.email.send', {
      to,
      subject: metadata?.subject ?? `Scraping: ${message}`,
      html: `<p>${message}</p>`,
    });
    this.logger.log(`Email notification sent to ${to.join(', ')}`);
  }
}
