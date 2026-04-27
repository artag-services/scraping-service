import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

/**
 * Thin wrapper around ioredis. Used for session persistence (cookies +
 * localStorage cached per domain + sessionKey).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: Redis | null = null

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.config.get<string>('REDIS_HOST') ?? 'redis'
    const port = Number(this.config.get<string>('REDIS_PORT') ?? 6379)

    this.client = new Redis({
      host,
      port,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    })

    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`))

    try {
      await this.client.connect()
      this.logger.log(`Redis connected → ${host}:${port}`)
    } catch (err) {
      this.logger.warn(`Redis initial connect failed (will retry on demand): ${(err as Error).message}`)
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client?.quit()
    } catch {
      // ignore
    }
  }

  private get raw(): Redis {
    if (!this.client) throw new Error('Redis client not initialized')
    return this.client
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const json = JSON.stringify(value)
    if (ttlSeconds) {
      await this.raw.set(key, json, 'EX', ttlSeconds)
    } else {
      await this.raw.set(key, json)
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.raw.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async del(key: string): Promise<void> {
    await this.raw.del(key)
  }
}
