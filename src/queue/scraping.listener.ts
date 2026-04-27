import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { v4 as uuid } from 'uuid'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { QUEUES, ROUTING_KEYS } from '../rabbitmq/constants/queues'
import { PuppeteerScraper } from '../scraper/puppeteer.scraper'
import { JobsService } from '../jobs/jobs.service'
import {
  ScrapingTaskRequest,
  ScrapingTaskMessage,
  ScrapingResult,
  RpcEnvelope,
} from '../common/types'

/**
 * Single entry point that consumes RabbitMQ messages from the gateway:
 *  - `channels.scraping.task` (fire-and-forget) — runs the scraping pipeline
 *  - `channels.scraping.list/get/delete` (RPC) — DB CRUD
 *  - `channels.scraping.cleanup-expired` (RPC) — delete past-expiresAt jobs
 *
 * For tasks: persists job → publishes lifecycle events → optionally dispatches
 * to notion/whatsapp/email if `output.targets` includes them.
 */
@Injectable()
export class ScrapingListener implements OnModuleInit {
  private readonly logger = new Logger(ScrapingListener.name)

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly scraper: PuppeteerScraper,
    private readonly jobs: JobsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitmq.subscribe(QUEUES.TASK, ROUTING_KEYS.TASK, (p) => this.handleTask(p))
    await this.rabbitmq.subscribe(QUEUES.LIST, ROUTING_KEYS.LIST, (p) => this.handleRpc(p, 'list'))
    await this.rabbitmq.subscribe(QUEUES.GET, ROUTING_KEYS.GET, (p) => this.handleRpc(p, 'get'))
    await this.rabbitmq.subscribe(QUEUES.DELETE, ROUTING_KEYS.DELETE, (p) =>
      this.handleRpc(p, 'delete'),
    )
    await this.rabbitmq.subscribe(QUEUES.CLEANUP_EXPIRED, ROUTING_KEYS.CLEANUP_EXPIRED, (p) =>
      this.handleRpc(p, 'cleanup'),
    )

    this.logger.log('✅ ScrapingListener ready — listening on task + list/get/delete/cleanup queues')
  }

  // ─────────────────────────── Task pipeline ───────────────────────────

  private async handleTask(payload: Record<string, unknown>): Promise<void> {
    const request = payload as unknown as ScrapingTaskRequest & { jobId?: string }
    const jobId = request.jobId ?? uuid()
    const taskMessage: ScrapingTaskMessage = { ...request, jobId }

    this.logger.log(`📨 Task ${jobId} → ${request.url} [${request.strategy}]`)

    try {
      // 1) Persist as QUEUED (with credentials redacted)
      await this.jobs.createQueued({ ...request, jobId })
      this.publishEvent(ROUTING_KEYS.EVENT_QUEUED, {
        jobId,
        url: request.url,
        userId: request.userId,
      })

      // 2) Mark RUNNING + emit
      await this.jobs.markStarted(jobId)
      this.publishEvent(ROUTING_KEYS.EVENT_STARTED, {
        jobId,
        url: request.url,
        userId: request.userId,
      })

      // 3) Run scraper
      const result = await this.scraper.run(taskMessage)

      // 4) Persist result + emit completion event
      if (result.success) {
        await this.jobs.markCompleted(jobId, result)
        this.publishEvent(ROUTING_KEYS.EVENT_COMPLETED, this.eventPayload(result))
        this.dispatchOutputs(taskMessage, result)
      } else {
        await this.jobs.markFailed(jobId, result)
        this.publishEvent(ROUTING_KEYS.EVENT_FAILED, this.eventPayload(result))
      }
    } catch (err) {
      const message = (err as Error).message
      this.logger.error(`Pipeline error for job ${jobId}: ${message}`)
      this.publishEvent(ROUTING_KEYS.EVENT_FAILED, {
        jobId,
        url: request.url,
        userId: request.userId,
        success: false,
        error: message,
      })
      throw err
    }
  }

  /**
   * After a successful scrape, dispatch the result to additional services
   * if the user requested them via `output.targets`.
   */
  private dispatchOutputs(task: ScrapingTaskMessage, result: ScrapingResult): void {
    const targets = task.output?.targets ?? ['event']
    if (!targets.length) return

    const data = result.data ?? {}
    const title = (data as { title?: string }).title ?? 'Scraping Result'

    if (targets.includes('notion') && task.output?.notion) {
      this.rabbitmq.publish(ROUTING_KEYS.NOTION_SEND, {
        messageId: result.jobId,
        operation: 'create_page',
        message: title,
        metadata: {
          parent_page_id: task.output.notion.parentPageId,
          title: task.output.notion.title ?? title,
          icon: task.output.notion.icon ?? '🔗',
          url: task.url,
          userId: task.userId,
          scrapedData: data,
        },
      })
      this.logger.log(`📨 Dispatched to notion for job ${result.jobId}`)
    }

    if (targets.includes('whatsapp') && task.output?.whatsapp) {
      const summary = `✅ Scraping completado\n📄 ${title}\n🔗 ${task.url}`
      this.rabbitmq.publish(ROUTING_KEYS.WHATSAPP_SEND, {
        messageId: result.jobId,
        recipients: [task.output.whatsapp.to],
        message: summary,
      })
      this.logger.log(`📨 Dispatched to whatsapp for job ${result.jobId}`)
    }

    if (targets.includes('email') && task.output?.email) {
      this.rabbitmq.publish(ROUTING_KEYS.EMAIL_SEND, {
        to: task.output.email.to,
        subject: task.output.email.subject ?? `Scraping: ${title}`,
        html: `<h1>${title}</h1><p>URL: <a href="${task.url}">${task.url}</a></p><pre>${JSON.stringify(
          data,
          null,
          2,
        ).slice(0, 5000)}</pre>`,
      })
      this.logger.log(`📨 Dispatched to email for job ${result.jobId}`)
    }
  }

  private eventPayload(result: ScrapingResult): Record<string, unknown> {
    return {
      jobId: result.jobId,
      userId: result.userId,
      url: result.url,
      success: result.success,
      data: result.data,
      error: result.error,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
    }
  }

  private publishEvent(routingKey: string, payload: Record<string, unknown>): void {
    try {
      this.rabbitmq.publish(routingKey, payload)
    } catch (err) {
      this.logger.warn(`Failed to publish event to ${routingKey}: ${(err as Error).message}`)
    }
  }

  // ─────────────────────────── RPC handler ───────────────────────────

  private async handleRpc(payload: Record<string, unknown>, op: string): Promise<void> {
    const env = payload as RpcEnvelope
    try {
      const data = await this.dispatch(op, env)
      if (env.correlationId) this.respond(env.correlationId, true, data)
    } catch (err) {
      const message = (err as Error).message
      this.logger.error(`[${op}] failed: ${message}`)
      if (env.correlationId) this.respond(env.correlationId, false, { error: message })
    }
  }

  private async dispatch(op: string, env: RpcEnvelope): Promise<unknown> {
    switch (op) {
      case 'list': {
        const { limit, userId } = env as { limit?: number; userId?: string }
        return { jobs: await this.jobs.list(limit ?? 50, userId) }
      }
      case 'get': {
        const { id } = env as { id: string }
        if (!id) throw new Error('id is required')
        return { job: await this.jobs.get(id) }
      }
      case 'delete': {
        const { id } = env as { id: string }
        if (!id) throw new Error('id is required')
        await this.jobs.remove(id)
        return { id, deleted: true }
      }
      case 'cleanup': {
        const count = await this.jobs.cleanupExpired()
        return { deleted: count }
      }
      default:
        throw new Error(`Unknown op: ${op}`)
    }
  }

  private respond(correlationId: string, success: boolean, data: unknown): void {
    this.rabbitmq.publish(ROUTING_KEYS.RESPONSE, {
      correlationId,
      success,
      ...(typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : { data }),
    })
  }
}
