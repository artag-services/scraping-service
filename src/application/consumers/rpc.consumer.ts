import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { QUEUES, ROUTING_KEYS } from '../../rabbitmq/constants/queues';
import { ManageJobUseCase } from '../../domain/services/manage-job.usecase';

interface RpcEnvelope {
  correlationId?: string;
  [k: string]: unknown;
}

@Injectable()
export class RpcConsumer implements OnModuleInit {
  private readonly logger = new Logger(RpcConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly manageJob: ManageJobUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitmq.subscribe(QUEUES.LIST, ROUTING_KEYS.LIST, (p) => this.handleRpc(p, 'list'));
    await this.rabbitmq.subscribe(QUEUES.GET, ROUTING_KEYS.GET, (p) => this.handleRpc(p, 'get'));
    await this.rabbitmq.subscribe(QUEUES.DELETE, ROUTING_KEYS.DELETE, (p) => this.handleRpc(p, 'delete'));
    await this.rabbitmq.subscribe(QUEUES.CLEANUP_EXPIRED, ROUTING_KEYS.CLEANUP_EXPIRED, (p) => this.handleRpc(p, 'cleanup'));
    this.logger.log('RpcConsumer ready — listening on list/get/delete/cleanup queues');
  }

  private async handleRpc(payload: Record<string, unknown>, op: string): Promise<void> {
    const env = payload as RpcEnvelope;
    try {
      const data = await this.dispatch(op, env);
      if (env.correlationId) await this.respond(env.correlationId, true, data);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`[${op}] failed: ${message}`);
      if (env.correlationId) await this.respond(env.correlationId, false, { error: message });
    }
  }

  private async dispatch(op: string, env: RpcEnvelope): Promise<unknown> {
    switch (op) {
      case 'list': {
        const { limit, userId } = env as { limit?: number; userId?: string };
        return { jobs: await this.manageJob.list(limit ?? 50, userId) };
      }
      case 'get': {
        const { id } = env as { id: string };
        if (!id) throw new Error('id is required');
        return { job: await this.manageJob.get(id) };
      }
      case 'delete': {
        const { id } = env as { id: string };
        if (!id) throw new Error('id is required');
        await this.manageJob.remove(id);
        return { id, deleted: true };
      }
      case 'cleanup': {
        const count = await this.manageJob.cleanupExpired();
        return { deleted: count };
      }
      default:
        throw new Error(`Unknown op: ${op}`);
    }
  }

  private async respond(correlationId: string, success: boolean, data: unknown): Promise<void> {
    await this.rabbitmq.publish(ROUTING_KEYS.RESPONSE, {
      correlationId,
      success,
      ...(typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : { data }),
    });
  }
}
