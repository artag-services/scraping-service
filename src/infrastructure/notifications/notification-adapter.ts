import { Injectable, Logger } from '@nestjs/common';
import { INotificationAdapter } from '../../domain/ports/INotificationAdapter';

@Injectable()
export class NotificationAdapter implements INotificationAdapter {
  readonly name: string;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(name: string) {
    this.name = name;
  }

  async send(userId: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    this.logger.log(`[${this.name}] send to ${userId}: ${message.substring(0, 100)}`);
  }
}
