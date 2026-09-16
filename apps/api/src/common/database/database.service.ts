import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

type SqlParam = string | number | boolean | null | Date | Buffer;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.pool = mysql.createPool({
      host: this.config.get<string>('MYSQL_HOST', '127.0.0.1'),
      port: Number(this.config.get('MYSQL_PORT', 3306)),
      user: this.config.get<string>('MYSQL_USER', 'walk'),
      password: this.config.get<string>('MYSQL_PASSWORD', 'walktogether'),
      database: this.config.get<string>('MYSQL_DATABASE', 'walk_together'),
      waitForConnections: true,
      connectionLimit: 10,
      timezone: '+08:00',
    });

    try {
      await this.ensureSchema();
    } catch (error) {
      this.logger.error(
        'users 表初始化失败，登录前请确认 MySQL 已启动',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }

  async ping(): Promise<boolean> {
    try {
      await this.query('SELECT 1 AS ok');
      return true;
    } catch {
      return false;
    }
  }

  async query<T extends RowDataPacket>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const [rows] = await this.poolOrThrow().execute<T[]>(sql, params);
    return rows;
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<ResultSetHeader> {
    const [result] = await this.poolOrThrow().execute<ResultSetHeader>(sql, params);
    return result;
  }

  private poolOrThrow(): Pool {
    if (!this.pool) {
      throw new ServiceUnavailableException('数据库未就绪');
    }
    return this.pool;
  }

  /**
   * 用户表按交付文档用户系统预留：
   * 手机号 / 微信身份 / 昵称头像 / 车型车牌 / 车主认证状态。
   * M1 只用登录字段；认证和改资料留给后续模块。
   */
  private async ensureSchema(): Promise<void> {
    await this.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) NULL,
        wx_unionid VARCHAR(64) NULL,
        wx_mini_openid VARCHAR(64) NULL,
        wx_app_openid VARCHAR(64) NULL,
        nickname VARCHAR(64) NOT NULL,
        avatar_url VARCHAR(512) NULL,
        status TINYINT NOT NULL DEFAULT 1,
        vehicle_model VARCHAR(64) NULL,
        plate_number VARCHAR(16) NULL,
        cert_status TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_users_phone (phone),
        UNIQUE KEY uk_users_unionid (wx_unionid),
        UNIQUE KEY uk_users_mini_openid (wx_mini_openid),
        UNIQUE KEY uk_users_app_openid (wx_app_openid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}
