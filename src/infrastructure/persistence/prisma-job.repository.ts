import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScrapingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IJobRepository, ScrapingJobRecord } from '../../domain/ports/IJobRepository';
import { ScrapingTaskRequest } from '../../domain/value-objects/scraping-task';
import { ScrapingResult } from '../../domain/value-objects/scraping-result';

const DEFAULT_EXPIRES_AFTER_MS = 24 * 60 * 60 * 1000;

const DOMAIN_TO_DB: Record<string, ScrapingStatus> = {
  QUEUED: ScrapingStatus.QUEUED,
  STARTED: ScrapingStatus.RUNNING,
  COMPLETED: ScrapingStatus.SUCCESS,
  FAILED: ScrapingStatus.FAILED,
};

const DB_TO_DOMAIN: Record<string, string> = {
  QUEUED: 'QUEUED',
  RUNNING: 'STARTED',
  SUCCESS: 'COMPLETED',
  FAILED: 'FAILED',
};

@Injectable()
export class PrismaJobRepository implements IJobRepository {
  private readonly logger = new Logger(PrismaJobRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createQueued(request: ScrapingTaskRequest & { jobId?: string }): Promise<ScrapingJobRecord> {
    const expiresAfterMs = request.lifecycle?.expiresAfterMs ?? DEFAULT_EXPIRES_AFTER_MS;
    const now = new Date();
    const record = await this.prisma.scrapingJob.create({
      data: {
        id: request.jobId ?? undefined,
        userId: request.userId ?? null,
        url: request.url,
        strategy: request.strategy,
        request: this.redactCredentials(request as unknown as Record<string, unknown>) as any,
        status: ScrapingStatus.QUEUED,
        result: undefined as any,
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        expiresAt: new Date(now.getTime() + expiresAfterMs),
      },
    });
    return this.toRecord(record);
  }

  async markStarted(jobId: string): Promise<void> {
    await this.prisma.scrapingJob.update({
      where: { id: jobId },
      data: { status: ScrapingStatus.RUNNING, startedAt: new Date() },
    });
  }

  async markCompleted(jobId: string, result: ScrapingResult): Promise<void> {
    await this.prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: ScrapingStatus.SUCCESS,
        result: (result.data ?? {}) as any,
        completedAt: new Date(result.completedAt),
        durationMs: result.durationMs,
      },
    });
  }

  async markFailed(jobId: string, result: ScrapingResult): Promise<void> {
    await this.prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: ScrapingStatus.FAILED,
        result: (result.data ?? {}) as any,
        error: result.error ?? 'Unknown error',
        completedAt: new Date(result.completedAt),
        durationMs: result.durationMs,
      },
    });
  }

  private redactCredentials(req: Record<string, unknown>): Record<string, unknown> {
    const cloned = JSON.parse(JSON.stringify(req));
    if (cloned.login && typeof cloned.login === 'object') {
      if ('password' in cloned.login) cloned.login.password = '[REDACTED]';
      if ('username' in cloned.login) cloned.login.username = '[REDACTED]';
    }
    return cloned;
  }

  async list(limit = 50, userId?: string): Promise<ScrapingJobRecord[]> {
    const records = await this.prisma.scrapingJob.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map((r) => this.toRecord(r));
  }

  async get(jobId: string): Promise<ScrapingJobRecord> {
    const record = await this.prisma.scrapingJob.findUniqueOrThrow({ where: { id: jobId } });
    return this.toRecord(record);
  }

  async remove(jobId: string): Promise<void> {
    await this.prisma.scrapingJob.delete({ where: { id: jobId } });
  }

  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.scrapingJob.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  private toRecord(r: any): ScrapingJobRecord {
    return {
      id: r.id,
      userId: r.userId,
      url: r.url,
      strategy: r.strategy,
      request: r.request as Record<string, unknown>,
      status: (DB_TO_DOMAIN[r.status] ?? r.status) as any,
      result: r.result as Record<string, unknown> | null,
      error: r.error,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      durationMs: r.durationMs,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
