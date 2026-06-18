import { Injectable } from '@nestjs/common';
import { IEventPublisher } from '../../domain/ports/IEventPublisher';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';

@Injectable()
export class RabbitMQEventPublisher implements IEventPublisher {
  constructor(private readonly rabbitmq: RabbitMQService) {}

  async publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    await this.rabbitmq.publish(routingKey, payload);
  }
}
