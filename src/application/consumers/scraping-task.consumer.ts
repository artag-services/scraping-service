import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { QUEUES, ROUTING_KEYS } from '../../rabbitmq/constants/queues';
import { ExecuteScrapingUseCase } from '../../domain/services/execute-scraping.usecase';
import { ManageJobUseCase } from '../../domain/services/manage-job.usecase';
import { ScrapingTaskMessage } from '../../domain/value-objects/scraping-task';

@Injectable()
export class ScrapingTaskConsumer implements OnModuleInit {
  private readonly logger = new Logger(ScrapingTaskConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly executeScraping: ExecuteScrapingUseCase,
    private readonly manageJob: ManageJobUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.rabbitmq.subscribe(QUEUES.TASK, ROUTING_KEYS.TASK, (p) => this.handleTask(p));
      this.logger.log('ScrapingTaskConsumer ready — listening on task queue');
    } catch (err) {
      this.logger.error(`Failed to subscribe to task queue: ${(err as Error).message}`);
    }
  }

  private async handleTask(payload: Record<string, unknown>): Promise<void> {
    const request = payload as Record<string, unknown> & { jobId?: string };
    const jobId = request.jobId ?? uuid();

    const task = new ScrapingTaskMessage(
      jobId,
      request.url as string,
      request.userId as string | undefined,
      (request.strategy as any) ?? 'auto',
      undefined, undefined, undefined, undefined, undefined, undefined,
    );

    this.logger.log(`Task ${jobId} → ${task.url} [${task.strategy}]`);

    try {
      await this.manageJob.create({ ...request, jobId } as any);
      await this.publishEvent(ROUTING_KEYS.EVENT_QUEUED, { jobId, url: task.url, userId: task.userId });
      await this.publishEvent('data.scraping.task.created', { jobId, taskId: jobId, userId: task.userId, url: task.url, status: 'queued' });

      await this.executeScraping.execute(task);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Pipeline error for job ${jobId}: ${message}`);
      await this.publishEvent(ROUTING_KEYS.EVENT_FAILED, { jobId, url: task.url, userId: task.userId, success: false, error: message });
      await this.publishEvent('data.scraping.task.failed', { taskId: jobId, jobId, userId: task.userId, url: task.url, status: 'failed', error: message, timestamp: new Date().toISOString() });
    }
  }

  private async publishEvent(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    try { await this.rabbitmq.publish(routingKey, payload); } catch {}
  }
}
