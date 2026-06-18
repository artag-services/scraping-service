import { Injectable } from '@nestjs/common';
import { ICacheService } from '../../domain/ports/ICacheService';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RedisCacheService implements ICacheService {
  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    return this.redis.getJson<T>(key);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.redis.setJson(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
