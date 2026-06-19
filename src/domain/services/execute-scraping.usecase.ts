import { Logger } from '@nestjs/common';
import { ScrapingTaskMessage } from '../value-objects/scraping-task';
import { ScrapingResult } from '../value-objects/scraping-result';
import { ScrapingOrchestrator } from './scraping-orchestrator';
import { IJobRepository } from '../ports/IJobRepository';
import { IEventPublisher } from '../ports/IEventPublisher';
import { IOutputDispatcher } from '../ports/IOutputDispatcher';
import { ICacheService } from '../ports/ICacheService';
import { IBrowserPool } from '../ports/IBrowserPool';
import { ISessionManager } from '../ports/ISessionManager';
import { IAutoScraper } from '../ports/IAutoScraper';
import { INotificationAdapter } from '../ports/INotificationAdapter';
import { NotificationAdapterRegistry } from './notification-adapter.registry';
import { Timed } from '../../utils/timing';

export class ExecuteScrapingUseCase {
  private readonly logger = new Logger(ExecuteScrapingUseCase.name);

  constructor(
    private readonly browserPool: IBrowserPool,
    private readonly jobRepo: IJobRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly outputDispatcher: IOutputDispatcher,
    private readonly cacheService: ICacheService,
    private readonly notificationRegistry: NotificationAdapterRegistry,
    private readonly defaultTimeout: number,
    private readonly sessionManager?: ISessionManager,
    private readonly autoScraper?: IAutoScraper,
  ) {}

  @Timed()
  async execute(task: ScrapingTaskMessage): Promise<void> {
    const cacheKey = this.cacheKey(task);
    const cached = await this.readCache(cacheKey, task);
    if (cached) return;

    await this.jobRepo.markStarted(task.jobId);
    await this.publishEvent(`data.scraping.task.started`, task as unknown as Record<string, unknown>);

    const startedAt = new Date();
    const timeout = task.performance?.timeoutMs ?? this.defaultTimeout;

    let browser = await this.browserPool.acquire();
    try {
      const orchestrator = new ScrapingOrchestrator(browser, timeout, this.sessionManager, this.autoScraper);
      const data = await orchestrator.execute(task);

      const completedAt = new Date();
      const result: ScrapingResult = {
        jobId: task.jobId,
        userId: task.userId,
        url: task.url,
        success: true,
        data,
        error: undefined,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };

      await this.jobRepo.markCompleted(task.jobId, result);
      await this.publishEvent(`data.scraping.task.completed`, result as unknown as Record<string, unknown>);
      await this.writeCache(cacheKey, task);
      await this.outputDispatcher.dispatch(task, result);
      await this.sendNotifications(task, result);
    } catch (err) {
      const message = (err as Error).message;
      const completedAt = new Date();
      const failedResult: ScrapingResult = {
        jobId: task.jobId,
        userId: task.userId,
        url: task.url,
        success: false,
        data: undefined,
        error: message,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };

      await this.jobRepo.markFailed(task.jobId, failedResult);
      await this.publishEvent(`data.scraping.task.failed`, failedResult as unknown as Record<string, unknown>);
    } finally {
      if (browser) {
        await this.browserPool.release(browser).catch(() => {});
      }
    }
  }

  private cacheKey(task: ScrapingTaskMessage): string {
    if (!task.performance?.cacheTtlMs) return '';
    return `scraping:${task.jobId}:${task.url}:${task.strategy}`;
  }

  private async readCache(cacheKey: string, task: ScrapingTaskMessage): Promise<boolean> {
    if (!cacheKey) return false;
    const cached = await this.cacheService.get<Record<string, unknown>>(cacheKey);
    if (!cached) return false;
    await this.jobRepo.markCompleted(task.jobId, {
      jobId: task.jobId, userId: task.userId, url: task.url,
      success: true, data: cached, error: undefined,
      startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 0,
    });
    await this.publishEvent(`data.scraping.task.completed`, {
      jobId: task.jobId, userId: task.userId, url: task.url, success: true, data: cached,
      startedAt: '', completedAt: '', durationMs: 0,
    } as unknown as Record<string, unknown>);
    return true;
  }

  private async writeCache(cacheKey: string, task: ScrapingTaskMessage): Promise<void> {
    if (!cacheKey || !task.performance?.cacheTtlMs) return;
    await this.cacheService.set(cacheKey, { cached: true }, Math.floor(task.performance.cacheTtlMs / 1000));
  }

  private async publishEvent(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.eventPublisher.publish(routingKey, payload);
    } catch {
      // fire-and-forget
    }
  }

  private async sendNotifications(task: ScrapingTaskMessage, result: ScrapingResult): Promise<void> {
    if (!result.success) return;
    const targets = task.output?.targets ?? [];
    this.logger.log(`sendNotifications: targets=[${targets.join(',')}] userId=${task.userId}`);
    for (const target of targets) {
      if (target === 'event') continue;
      try {
        const adapter = this.notificationRegistry.get(target);
        if (adapter) {
          this.logger.log(`sendNotifications: adapter=${target} found, sending...`);
          const message = `Scraping completed for ${task.url}`;
          await adapter.send(task.userId ?? 'unknown', message, { jobId: task.jobId, url: task.url, data: result.data });
          this.logger.log(`sendNotifications: adapter=${target} done`);
        } else {
          this.logger.warn(`sendNotifications: adapter=${target} NOT FOUND in registry`);
        }
      } catch (err) {
        this.logger.error(`sendNotifications: adapter=${target} FAILED: ${(err as Error).message}`);
      }
    }
  }
}
