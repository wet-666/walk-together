import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, type ApiResult, type HealthData } from '@walk-together/shared-types';
import { DatabaseService } from '../common/database/database.service';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

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
        version: this.config.get<string>('APP_VERSION', '0.1.0-m4'),
      },
    };
  }

  private async pingMysql(): Promise<'ok' | 'down'> {
    return (await this.db.ping()) ? 'ok' : 'down';
  }

  private async pingRedis(): Promise<'ok' | 'down'> {
    return (await this.redis.ping()) ? 'ok' : 'down';
  }
}
