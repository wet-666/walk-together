import { Injectable } from '@nestjs/common';
import {
  CertStatus,
  ErrorCode,
  type CertStatusValue,
  type UpdateProfileDto,
  type UserProfile,
  type WechatClientValue,
} from '@walk-together/shared-types';
import type { RowDataPacket } from 'mysql2';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService, type DbOps } from '../../common/database/database.service';
import { TokenService } from '../../common/auth/token.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  assertAvatarUrl,
  assertNickname,
  defaultNickname,
  normalizeOptional,
} from './user.util';

type UserRow = RowDataPacket & {
  id: number | string;
  phone: string | null;
  wx_unionid: string | null;
  wx_mini_openid: string | null;
  wx_app_openid: string | null;
  nickname: string;
  avatar_url: string | null;
  status: number;
  vehicle_model: string | null;
  plate_number: string | null;
  cert_status: number;
  created_at: Date | string;
};

const AVATAR_DIR = join(process.cwd(), 'uploads', 'avatars');

@Injectable()
export class UserService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tokens: TokenService,
  ) {}

  async getProfile(userId: number): Promise<UserProfile> {
    const user = await this.requireActive(userId);
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

  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<UserProfile> {
    await this.requireActive(userId);
    const sets: string[] = [];
    const params: Array<string | number | null> = [];

    if (dto.nickname !== undefined) {
      sets.push('nickname = ?');
      params.push(assertNickname(dto.nickname));
    }
    if (dto.avatarUrl !== undefined) {
      sets.push('avatar_url = ?');
      params.push(dto.avatarUrl.trim() ? assertAvatarUrl(dto.avatarUrl) : null);
    }
    if (dto.vehicleModel !== undefined) {
      sets.push('vehicle_model = ?');
      params.push(normalizeOptional(dto.vehicleModel, 64, '车型'));
    }
    if (dto.plateNumber !== undefined) {
      sets.push('plate_number = ?');
      params.push(normalizeOptional(dto.plateNumber, 16, '车牌号'));
    }

    if (sets.length === 0) {
      return this.getProfile(userId);
    }

    params.push(userId);
    await this.db.exec(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.getProfile(userId);
  }

  async saveAvatarFile(
    userId: number,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<UserProfile> {
    await this.requireActive(userId);
    if (file.size > 2 * 1024 * 1024) {
      throw new BusinessException(ErrorCode.PROFILE_INVALID, '头像不能超过 2MB');
    }
    const ext = this.avatarExt(file.mimetype);
    if (!ext) {
      throw new BusinessException(ErrorCode.PROFILE_INVALID, '请上传 jpg/png/webp 图片');
    }

    await mkdir(AVATAR_DIR, { recursive: true });
    const filename = `${userId}_${Date.now()}${ext}`;
    await writeFile(join(AVATAR_DIR, filename), file.buffer);
    return this.updateProfile(userId, { avatarUrl: `/files/avatars/${filename}` });
  }

  async bindPhone(userId: number, phone: string): Promise<UserProfile> {
    return this.db.withTransaction(async (ops) => {
      const current = await this.findByIdWith(ops, userId);
      if (!current) {
        throw BusinessException.unauthorized();
      }
      this.assertActive(current);

      if (current.phone === phone) {
        return this.toProfile(current);
      }

      const other = await this.findByPhoneWith(ops, phone);
      if (other && Number(other.id) !== Number(current.id)) {
        this.assertActive(other);
        if (this.hasWechat(other)) {
          throw new BusinessException(
            ErrorCode.PHONE_BIND_CONFLICT,
            '该手机号已绑定其他账号',
          );
        }
        await ops.exec(
          `UPDATE users
           SET phone = NULL,
               status = 0
           WHERE id = ?`,
          [other.id],
        );
        await ops.exec(
          `UPDATE users
           SET phone = ?,
               vehicle_model = COALESCE(vehicle_model, ?),
               plate_number = COALESCE(plate_number, ?)
           WHERE id = ?`,
          [phone, other.vehicle_model, other.plate_number, current.id],
        );
      } else {
        await ops.exec('UPDATE users SET phone = ? WHERE id = ?', [phone, current.id]);
      }

      const updated = await this.findByIdWith(ops, userId);
      return this.toProfile(updated as UserRow);
    });
  }

  async cancel(userId: number): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw BusinessException.unauthorized();
    }
    this.assertActive(user);
    await this.db.exec('UPDATE users SET status = 0 WHERE id = ? AND status = 1', [userId]);
    await this.tokens.blockUser(userId);
  }

  private hasWechat(user: UserRow): boolean {
    return Boolean(user.wx_unionid || user.wx_mini_openid || user.wx_app_openid);
  }

  private avatarExt(mimetype: string): string | null {
    if (mimetype === 'image/jpeg') {
      return '.jpg';
    }
    if (mimetype === 'image/png') {
      return '.png';
    }
    if (mimetype === 'image/webp') {
      return '.webp';
    }
    return null;
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

  private async requireActive(userId: number, ops?: DbOps): Promise<UserRow> {
    const user = await this.findByIdWith(ops ?? this.db, userId);
    if (!user) {
      throw BusinessException.unauthorized();
    }
    this.assertActive(user);
    return user;
  }

  private async findById(id: number): Promise<UserRow | null> {
    return this.findByIdWith(this.db, id);
  }

  private async findByIdWith(ops: DbOps, id: number | string): Promise<UserRow | null> {
    const rows = await ops.query<UserRow>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  private async findByPhone(phone: string): Promise<UserRow | null> {
    return this.findByPhoneWith(this.db, phone);
  }

  private async findByPhoneWith(ops: DbOps, phone: string): Promise<UserRow | null> {
    const rows = await ops.query<UserRow>('SELECT * FROM users WHERE phone = ? LIMIT 1', [
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
      throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, '账号已注销');
    }
  }

  private toProfile(user: UserRow): UserProfile {
    return {
      id: Number(user.id),
      phone: user.phone,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      vehicleModel: user.vehicle_model,
      plateNumber: user.plate_number,
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
