import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { AdminGuard } from './admin.guard'

const PAGE = 500
const SLEEP_MS_EVERY_N = 100

/**
 * One-shot CQRS backfill for scrapping. Re-emits:
 *   - `data.scraping.task.completed` for jobs with status=SUCCESS
 *   - `data.scraping.task.failed` for jobs with status=FAILED
 *
 * QUEUED / RUNNING jobs are skipped — those are in-flight; sync will see
 * them via the normal event flow when they finish.
 *
 * Auth: `X-Admin-Token: <ADMIN_BACKFILL_TOKEN>`.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class BackfillController {
  private readonly logger = new Logger(BackfillController.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  @Post('backfill-events')
  @HttpCode(HttpStatus.OK)
  async backfill() {
    const started = Date.now()
    let scanned = 0
    let published = 0

    for (let skip = 0; ; skip += PAGE) {
      const jobs = await this.prisma.scrapingJob.findMany({
        skip,
        take: PAGE,
        where: { status: { in: ['SUCCESS', 'FAILED'] as never } },
        orderBy: { createdAt: 'asc' },
      })
      if (jobs.length === 0) break
      scanned += jobs.length

      for (const job of jobs) {
        const data = (job.result ?? {}) as { title?: string }
        const isSuccess = job.status === ('SUCCESS' as never)
        const routingKey = isSuccess
          ? 'data.scraping.task.completed'
          : 'data.scraping.task.failed'
        await this.rabbitmq.publish(routingKey, {
          taskId: job.id,
          jobId: job.id,
          userId: job.userId ?? null,
          url: job.url,
          title: data.title ?? null,
          status: isSuccess ? 'completed' : 'failed',
          startedAt: job.startedAt?.toISOString() ?? null,
          timestamp: (job.completedAt ?? job.updatedAt).toISOString(),
          durationMs: job.durationMs ?? null,
          error: job.error ?? null,
          notionPageUrl: null,
        })
        published++
        if (published % SLEEP_MS_EVERY_N === 0) await this.sleep(10)
      }
    }

    const durationMs = Date.now() - started
    this.logger.log(`Backfill done: scanned=${scanned} published=${published} durationMs=${durationMs}`)
    return { service: 'scraping', scanned, published, durationMs }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }
}
