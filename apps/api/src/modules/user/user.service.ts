import { Injectable } from '@nestjs/common';
import {
  CertStatus,
  ErrorCode,
  type CertStatusValue,
  type UserProfile,
  type WechatClientValue,
} from '@walk-together/shared-types';
import type { RowDataPacket } from 'mysql2';
import { DatabaseService } from '../../common/database/database.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { defaultNickname } from './user.util';

type UserRow = RowDataPacket & {
  id: number | string;
  phone: string | null;
  wx_unionid: string | null;
  wx_mini_openid: string | null;
  wx_app_openid: string | null;
  nickname: string;
  avatar_url: string | null;
  status: number;
  cert_status: number;
  created_at: Date | string;
};

@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(userId: number): Promise<UserProfile> {
    const user = await this.findById(userId);
    if (!user) {
      throw BusinessException.unauthorized();
    }
    if (user.status !== 1) {
      throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, '账号已禁用');
    }
    return this.toProfile(user);
  }

  async loginByPhone(phone: string): Promise<UserProfile> {
    const existing = await this.findByPhone(phone);
    if (existing) {
      this.assertActive(existing);
      return this.toProfile(existing);
    }

    const nickname = defaultNickname(phone);
    const result = await this.db.exec(
      `INSERT INTO users (phone, nickname, status, cert_status)
       VALUES (?, ?, 1, 0)`,
      [phone, nickname],
    );
    return this.getProfile(Number(result.insertId));
  }

  async loginByWechat(input: {
    client: WechatClientValue;
    openid: string;
    unionid: string | null;
    nickname?: string | null;
    avatarUrl?: string | null;
  }): Promise<UserProfile> {
    const existing =
      (input.unionid ? await this.findByUnionId(input.unionid) : null) ??
      (await this.findByOpenId(input.client, input.openid));

    if (existing) {
      this.assertActive(existing);
      await this.syncWechat(existing.id, input);
      return this.getProfile(Number(existing.id));
    }

    const nickname = input.nickname?.trim() || defaultNickname(input.openid);
    const openidColumn = input.client === 'mini' ? 'wx_mini_openid' : 'wx_app_openid';
    const result = await this.db.exec(
      `INSERT INTO users (nickname, avatar_url, wx_unionid, ${openidColumn}, status, cert_status)
       VALUES (?, ?, ?, ?, 1, 0)`,
      [nickname, input.avatarUrl ?? null, input.unionid, input.openid],
    );
    return this.getProfile(Number(result.insertId));
  }

  private async syncWechat(
    userId: number | string,
    input: {
      client: WechatClientValue;
      openid: string;
      unionid: string | null;
      nickname?: string | null;
      avatarUrl?: string | null;
    },
  ): Promise<void> {
    const openidColumn = input.client === 'mini' ? 'wx_mini_openid' : 'wx_app_openid';
    await this.db.exec(
      `UPDATE users
       SET ${openidColumn} = COALESCE(${openidColumn}, ?),
           wx_unionid = COALESCE(wx_unionid, ?),
           nickname = CASE WHEN ? IS NOT NULL AND ? <> '' THEN ? ELSE nickname END,
           avatar_url = CASE WHEN ? IS NOT NULL AND ? <> '' THEN ? ELSE avatar_url END
       WHERE id = ?`,
      [
        input.openid,
        input.unionid,
        input.nickname ?? null,
        input.nickname ?? '',
        input.nickname ?? '',
        input.avatarUrl ?? null,
        input.avatarUrl ?? '',
        input.avatarUrl ?? '',
        userId,
      ],
    );
  }

  private async findById(id: number): Promise<UserRow | null> {
    const rows = await this.db.query<UserRow>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  private async findByPhone(phone: string): Promise<UserRow | null> {
    const rows = await this.db.query<UserRow>('SELECT * FROM users WHERE phone = ? LIMIT 1', [
      phone,
    ]);
    return rows[0] ?? null;
  }

  private async findByUnionId(unionid: string): Promise<UserRow | null> {
    const rows = await this.db.query<UserRow>(
      'SELECT * FROM users WHERE wx_unionid = ? LIMIT 1',
      [unionid],
    );
    return rows[0] ?? null;
  }

  private async findByOpenId(client: WechatClientValue, openid: string): Promise<UserRow | null> {
    const column = client === 'mini' ? 'wx_mini_openid' : 'wx_app_openid';
    const rows = await this.db.query<UserRow>(
      `SELECT * FROM users WHERE ${column} = ? LIMIT 1`,
      [openid],
    );
    return rows[0] ?? null;
  }

  private assertActive(user: UserRow): void {
    if (user.status !== 1) {
      throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, '账号已禁用');
    }
  }

  private toProfile(user: UserRow): UserProfile {
    return {
      id: Number(user.id),
      phone: user.phone,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      certStatus: this.toCertStatus(user.cert_status),
      createdAt: this.toIso(user.created_at),
    };
  }

  private toCertStatus(value: number): CertStatusValue {
    if (value === 1) {
      return CertStatus.PENDING;
    }
    if (value === 2) {
      return CertStatus.APPROVED;
    }
    return CertStatus.NONE;
  }

  private toIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}
