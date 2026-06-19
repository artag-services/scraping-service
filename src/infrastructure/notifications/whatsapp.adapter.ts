import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INotificationAdapter } from '../../domain/ports/INotificationAdapter';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';

@Injectable()
export class WhatsAppNotificationAdapter implements INotificationAdapter {
  readonly name = 'whatsapp';
  private readonly logger = new Logger(WhatsAppNotificationAdapter.name);
  private readonly defaultTo: string;

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly config: ConfigService,
  ) {
    this.defaultTo = this.config.get<string>('PERSONAL_WHATSAPP_NUMBER', '');
  }

  async send(userId: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    const to = (metadata?.to as string) || userId || this.defaultTo;
    if (!to) {
      this.logger.warn('No recipient for WhatsApp notification — skipping');
      return;
    }
    await this.rabbitmq.publish('channels.whatsapp.send', {
      messageId: metadata?.jobId ?? `notify-${Date.now()}`,
      recipients: [to],
      message,
    });
    this.logger.log(`WhatsApp notification sent to ${to}`);
  }
}
