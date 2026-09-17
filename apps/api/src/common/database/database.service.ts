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

export type DbOps = {
  query: <T extends RowDataPacket>(sql: string, params?: SqlParam[]) => Promise<T[]>;
  exec: (sql: string, params?: SqlParam[]) => Promise<ResultSetHeader>;
};

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
        '表结构初始化失败，登录和行程前请确认 MySQL 已启动',
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

  async withTransaction<T>(work: (ops: DbOps) => Promise<T>): Promise<T> {
    const conn = await this.poolOrThrow().getConnection();
    await conn.beginTransaction();
    const ops: DbOps = {
      query: async <R extends RowDataPacket>(sql: string, params: SqlParam[] = []) => {
        const [rows] = await conn.execute<R[]>(sql, params);
        return rows;
      },
      exec: async (sql: string, params: SqlParam[] = []) => {
        const [result] = await conn.execute<ResultSetHeader>(sql, params);
        return result;
      },
    };
    try {
      const result = await work(ops);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
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
   * status：1 正常，0 已注销。
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

    await this.exec(`
      CREATE TABLE IF NOT EXISTS trips (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        captain_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(80) NOT NULL,
        origin_name VARCHAR(128) NOT NULL,
        origin_lng DECIMAL(10,6) NULL,
        origin_lat DECIMAL(10,6) NULL,
        dest_name VARCHAR(128) NOT NULL,
        dest_lng DECIMAL(10,6) NULL,
        dest_lat DECIMAL(10,6) NULL,
        depart_at DATETIME NOT NULL,
        estimated_days TINYINT UNSIGNED NOT NULL DEFAULT 1,
        daily_mileage INT UNSIGNED NULL,
        companion_depth VARCHAR(16) NOT NULL DEFAULT 'medium',
        along_plans VARCHAR(128) NULL,
        max_vehicles TINYINT UNSIGNED NOT NULL DEFAULT 5,
        privacy VARCHAR(16) NOT NULL DEFAULT 'public',
        allow_copy TINYINT NOT NULL DEFAULT 1,
        cover_url VARCHAR(512) NULL,
        fee_note VARCHAR(255) NULL,
        tags VARCHAR(255) NULL,
        announcement VARCHAR(255) NULL,
        invite_code VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'recruiting',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_trips_invite (invite_code),
        KEY idx_trips_depart (depart_at),
        KEY idx_trips_captain (captain_id),
        KEY idx_trips_status_privacy (status, privacy)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.exec(`
      CREATE TABLE IF NOT EXISTS trip_nodes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        trip_id BIGINT UNSIGNED NOT NULL,
        seq TINYINT UNSIGNED NOT NULL,
        kind VARCHAR(16) NOT NULL,
        name VARCHAR(128) NOT NULL,
        lng DECIMAL(10,6) NULL,
        lat DECIMAL(10,6) NULL,
        KEY idx_trip_nodes_trip (trip_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.exec(`
      CREATE TABLE IF NOT EXISTS trip_members (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        trip_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        role VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL,
        apply_message VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_trip_user (trip_id, user_id),
        KEY idx_trip_members_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.exec(`
      CREATE TABLE IF NOT EXISTS trip_copies (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        trip_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        visibility VARCHAR(16) NOT NULL DEFAULT 'private',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_copy_trip_user (trip_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.exec(`
      CREATE TABLE IF NOT EXISTS trip_copy_nodes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        copy_id BIGINT UNSIGNED NOT NULL,
        seq TINYINT UNSIGNED NOT NULL,
        kind VARCHAR(16) NOT NULL,
        name VARCHAR(128) NOT NULL,
        lng DECIMAL(10,6) NULL,
        lat DECIMAL(10,6) NULL,
        KEY idx_copy_nodes (copy_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.exec(`
      CREATE TABLE IF NOT EXISTS im_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        trip_id BIGINT UNSIGNED NOT NULL,
        sender_id BIGINT UNSIGNED NULL,
        type VARCHAR(16) NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_im_messages_trip_id (trip_id, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.exec(`
      CREATE TABLE IF NOT EXISTS im_read_cursors (
        trip_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        last_read_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (trip_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.ensureColumn('trips', 'im_group_id', 'VARCHAR(64) NULL');
    await this.shiftUtcChatTimestamps();
  }

  private async shiftUtcChatTimestamps(): Promise<void> {
    await this.exec(`
      CREATE TABLE IF NOT EXISTS schema_patches (
        name VARCHAR(64) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    try {
      await this.exec('INSERT INTO schema_patches (name) VALUES (?)', ['im_messages_created_at_cst']);
    } catch (error) {
      const code = (error as { errno?: number } | null)?.errno;
      if (code === 1062) {
        return;
      }
      throw error;
    }
    await this.exec('UPDATE im_messages SET created_at = DATE_ADD(created_at, INTERVAL 8 HOUR)');
  }

  private async ensureColumn(table: string, column: string, definition: string): Promise<void> {
    try {
      await this.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      const code = (error as { errno?: number; code?: string } | null)?.errno;
      if (code !== 1060) {
        throw error;
      }
    }
  }
}
