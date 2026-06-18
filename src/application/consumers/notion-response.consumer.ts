import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotionResponseConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotionResponseConsumer.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('NotionResponseConsumer ready (placeholder — auto-notification flow TBD)');
  }
}
