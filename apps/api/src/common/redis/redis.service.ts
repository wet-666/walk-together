import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', '127.0.0.1'),
      port: Number(this.config.get('REDIS_PORT', 6379)),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.client.on('error', (error) => {
      this.logger.error(error.message);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.client?.disconnect();
    this.client = null;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.clientOrThrow().ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  get(key: string): Promise<string | null> {
    return this.clientOrThrow().get(key);
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.clientOrThrow().set(key, value, 'EX', ttlSeconds);
  }

  async setNx(key: string, ttlSeconds: number, value: string): Promise<boolean> {
    const result = await this.clientOrThrow().set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  incr(key: string): Promise<number> {
    return this.clientOrThrow().incr(key);
  }

  expire(key: string, ttlSeconds: number): Promise<number> {
    return this.clientOrThrow().expire(key, ttlSeconds);
  }

  del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return Promise.resolve(0);
    }
    return this.clientOrThrow().del(...keys);
  }

  ttl(key: string): Promise<number> {
    return this.clientOrThrow().ttl(key);
  }

  private clientOrThrow(): Redis {
    if (!this.client) {
      throw new Error('Redis 未就绪');
    }
    return this.client;
  }
}
