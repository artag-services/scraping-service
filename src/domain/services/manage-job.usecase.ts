import { ScrapingJob } from '../entities/scraping-job';
import { ScrapingTaskRequest, ScrapingTaskMessage } from '../value-objects/scraping-task';
import { ScrapingResult } from '../value-objects/scraping-result';
import { IJobRepository } from '../ports/IJobRepository';
import { IEventPublisher } from '../ports/IEventPublisher';

export class ManageJobUseCase {
  constructor(
    private readonly jobRepo: IJobRepository,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async create(request: ScrapingTaskRequest & { jobId?: string }): Promise<ScrapingJob> {
    const record = await this.jobRepo.createQueued(request);
    const message = new ScrapingTaskMessage(
      record.id,
      record.url,
      record.userId ?? undefined,
      record.strategy as any,
      undefined, undefined, undefined, undefined, undefined, undefined,
    );
    await this.eventPublisher.publish('data.scraping.task.created', {
      jobId: record.id,
      userId: record.userId,
      url: record.url,
      strategy: record.strategy,
      status: 'QUEUED',
    });
    return new ScrapingJob(
      record.id, record.userId, record.url, record.strategy,
      record.request, record.status, record.result, record.error,
      record.startedAt, record.completedAt, record.durationMs,
      record.expiresAt, record.createdAt, record.updatedAt,
    );
  }

  async get(jobId: string): Promise<ScrapingJob> {
    const record = await this.jobRepo.get(jobId);
    return new ScrapingJob(
      record.id, record.userId, record.url, record.strategy,
      record.request, record.status, record.result, record.error,
      record.startedAt, record.completedAt, record.durationMs,
      record.expiresAt, record.createdAt, record.updatedAt,
    );
  }

  async list(limit = 50, userId?: string): Promise<ScrapingJob[]> {
    const records = await this.jobRepo.list(limit, userId);
    return records.map((r) => new ScrapingJob(
      r.id, r.userId, r.url, r.strategy, r.request,
      r.status, r.result, r.error, r.startedAt, r.completedAt,
      r.durationMs, r.expiresAt, r.createdAt, r.updatedAt,
    ));
  }

  async remove(jobId: string): Promise<void> {
    await this.jobRepo.remove(jobId);
  }

  async cleanupExpired(): Promise<number> {
    return this.jobRepo.cleanupExpired();
  }
}
