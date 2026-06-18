import { Injectable, Logger } from '@nestjs/common';
import { INotificationAdapter } from '../../domain/ports/INotificationAdapter';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';

@Injectable()
export class WhatsAppNotificationAdapter implements INotificationAdapter {
  readonly name = 'whatsapp';
  private readonly logger = new Logger(WhatsAppNotificationAdapter.name);

  constructor(private readonly rabbitmq: RabbitMQService) {}

  async send(userId: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const to = metadata?.to as string ?? userId;
    await this.rabbitmq.publish('channels.whatsapp.send', {
      messageId: metadata?.jobId ?? `notify-${Date.now()}`,
      recipients: [to],
      message,
    });
    this.logger.log(`WhatsApp notification sent to ${to}`);
  }
}
