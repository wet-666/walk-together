import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, type ApiResult, type HealthData } from '@walk-together/shared-types';
import Redis from 'ioredis';
import mysql from 'mysql2/promise';

@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService) {}

  async check(): Promise<ApiResult<HealthData>> {
    const [mysqlStatus, redisStatus] = await Promise.all([
      this.pingMysql(),
      this.pingRedis(),
    ]);
    const ok = mysqlStatus === 'ok' && redisStatus === 'ok';

    return {
      code: ok ? ErrorCode.OK : ErrorCode.SERVICE_UNAVAILABLE,
      message: ok ? 'ok' : '服务未就绪',
      data: {
        mysql: mysqlStatus,
        redis: redisStatus,
        uptime: process.uptime(),
        version: this.config.get<string>('APP_VERSION', '0.1.0-m0'),
      },
    };
  }

  private async pingMysql(): Promise<'ok' | 'down'> {
    try {
      const conn = await mysql.createConnection({
        host: this.config.get<string>('MYSQL_HOST', '127.0.0.1'),
        port: Number(this.config.get('MYSQL_PORT', 3306)),
        user: this.config.get<string>('MYSQL_USER', 'walk'),
        password: this.config.get<string>('MYSQL_PASSWORD', 'walktogether'),
        database: this.config.get<string>('MYSQL_DATABASE', 'walk_together'),
        connectTimeout: 2000,
      });
      await conn.ping();
      await conn.end();
      return 'ok';
    } catch {
      return 'down';
    }
  }

  private async pingRedis(): Promise<'ok' | 'down'> {
    const redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', '127.0.0.1'),
      port: Number(this.config.get('REDIS_PORT', 6379)),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      const pong = await redis.ping();
      return pong === 'PONG' ? 'ok' : 'down';
    } catch {
      return 'down';
    } finally {
      redis.disconnect();
    }
  }
}
