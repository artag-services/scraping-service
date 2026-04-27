import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, ScrapingJob, ScrapingStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  ScrapingTaskRequest,
  ScrapingResult,
  DEFAULT_EXPIRES_AFTER_MS,
} from '../common/types'

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new ScrapingJob row in QUEUED state. The password (if any) in
   * `request.login.password` is REDACTED before persisting — we never store
   * plaintext credentials.
   */
  async createQueued(request: ScrapingTaskRequest & { jobId?: string }): Promise<ScrapingJob> {
    const expiresAfterMs = request.lifecycle?.expiresAfterMs ?? DEFAULT_EXPIRES_AFTER_MS
    const expiresAt = new Date(Date.now() + expiresAfterMs)

    return this.prisma.scrapingJob.create({
      data: {
        id: request.jobId,
        userId: request.userId,
        url: request.url,
        strategy: request.strategy,
        request: this.redactCredentials(request) as unknown as Prisma.InputJsonValue,
        status: ScrapingStatus.QUEUED,
        expiresAt,
      },
    })
  }

  async markStarted(jobId: string): Promise<void> {
    await this.prisma.scrapingJob.update({
      where: { id: jobId },
      data: { status: ScrapingStatus.RUNNING, startedAt: new Date() },
    }).catch(() => {})
  }

  async markCompleted(jobId: string, result: ScrapingResult): Promise<void> {
    await this.prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: ScrapingStatus.SUCCESS,
        result: result.data as unknown as Prisma.InputJsonValue,
        completedAt: new Date(result.completedAt),
        durationMs: result.durationMs,
      },
    }).catch(() => {})
  }

  async markFailed(jobId: string, result: ScrapingResult): Promise<void> {
    await this.prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: ScrapingStatus.FAILED,
        error: result.error,
        completedAt: new Date(result.completedAt),
        durationMs: result.durationMs,
      },
    }).catch(() => {})
  }

  async list(limit = 50, userId?: string): Promise<ScrapingJob[]> {
    return this.prisma.scrapingJob.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  async get(jobId: string): Promise<ScrapingJob> {
    const job = await this.prisma.scrapingJob.findUnique({ where: { id: jobId } })
    if (!job) throw new NotFoundException(`Job ${jobId} not found`)
    return job
  }

  async remove(jobId: string): Promise<void> {
    await this.prisma.scrapingJob.delete({ where: { id: jobId } })
  }

  /**
   * Delete all jobs whose expiresAt is in the past. Returns the number deleted.
   * Designed to be called periodically (e.g. by the scheduler service via a
   * CRON task hitting `channels.scraping.cleanup-expired`).
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.scrapingJob.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    if (result.count > 0) {
      this.logger.log(`🧹 Cleaned up ${result.count} expired scraping job(s)`)
    }
    return result.count
  }

  /**
   * Replace any `login.password` and `login.username` values in the request
   * with `[REDACTED]` so they never hit the DB. Read from runtime payload.
   */
  private redactCredentials(req: ScrapingTaskRequest): Record<string, unknown> {
    const cloned: Record<string, unknown> = JSON.parse(JSON.stringify(req))
    if (cloned.login && typeof cloned.login === 'object') {
      const login = cloned.login as Record<string, unknown>
      if ('password' in login) login.password = '[REDACTED]'
      if ('username' in login) login.username = '[REDACTED]'
    }
    return cloned
  }
}
