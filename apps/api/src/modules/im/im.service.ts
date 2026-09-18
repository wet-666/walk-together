import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ErrorCode,
  type ChatConversation,
  type ChatMessage,
  type ChatMessageTypeValue,
  type ChatReadCursor,
  type ImCredentials,
  type MemberStatusValue,
  type SendChatTextDto,
  type TripStatusValue,
} from '@walk-together/shared-types';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService } from '../../common/database/database.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { TripEventHub, type TripLifecycleEvent } from '../trip/trip-event.hub';
import { isLiveMemberStatus, toMysqlDateTime } from '../trip/trip.util';
import { ImHub } from './im.hub';
import { countMessageReaders, imageExt, imForbidden, imInvalid, parseChatText, toIso } from './im.util';
import { TencentImService } from './tencent-im.service';

type TripRow = RowDataPacket & {
  id: number | string;
  title: string;
  status: TripStatusValue;
  im_group_id: string | null;
  updated_at?: Date | string;
};

type MemberRow = RowDataPacket & {
  user_id: number | string;
  nickname: string;
  avatar_url: string | null;
  status: string;
};

type MessageRow = RowDataPacket & {
  id: number | string;
  trip_id: number | string;
  sender_id: number | string | null;
  type: ChatMessageTypeValue;
  content: string;
  created_at: Date | string;
  nickname?: string | null;
  avatar_url?: string | null;
};

const CHAT_DIR = join(process.cwd(), 'uploads', 'chat');

@Injectable()
export class ImService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImService.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly events: TripEventHub,
    private readonly hub: ImHub,
    private readonly tencent: TencentImService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.on((event) => {
      void this.onTripEvent(event);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  credentials(userId: number): ImCredentials {
    return this.tencent.credentials(userId);
  }

  async listConversations(userId: number): Promise<ChatConversation[]> {
    const trips = await this.db.query<TripRow>(
      `SELECT t.id, t.title, t.status, t.im_group_id, t.updated_at
       FROM trips t
       JOIN trip_members m ON m.trip_id = t.id
       WHERE m.user_id = ? AND m.status IN ('approved', 'leave_pending')
       ORDER BY t.updated_at DESC, t.id DESC`,
      [userId],
    );
    const conversations: ChatConversation[] = [];
    for (const trip of trips) {
      conversations.push(await this.toConversation(Number(trip.id), trip, userId, false));
    }
    conversations.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return conversations;
  }

  async getConversation(userId: number, tripId: number): Promise<ChatConversation> {
    const trip = await this.requireChatTrip(userId, tripId);
    return this.toConversation(tripId, trip, userId, true);
  }

  async listMessages(
    userId: number,
    tripId: number,
    beforeId?: number,
    limit = 30,
  ): Promise<ChatMessage[]> {
    await this.requireChatTrip(userId, tripId);
    const size = Math.min(Math.max(Number(limit) || 30, 1), 50);
    const params: Array<string | number> = [tripId];
    let sql = `
      SELECT m.*, u.nickname, u.avatar_url
      FROM im_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.trip_id = ?
    `;
    if (beforeId && Number.isInteger(beforeId) && beforeId > 0) {
      sql += ' AND m.id < ?';
      params.push(beforeId);
    }
    sql += ` ORDER BY m.id DESC LIMIT ${size}`;
    const [rows, liveUserIds, cursors] = await Promise.all([
      this.db.query<MessageRow>(sql, params),
      this.listLiveMemberIds(tripId),
      this.readCursorMap(tripId),
    ]);
    return rows.reverse().map((row) => this.toMessage(row, userId, liveUserIds, cursors));
  }

  async sendText(userId: number, tripId: number, dto: SendChatTextDto): Promise<ChatMessage> {
    await this.requireChatTrip(userId, tripId);
    const content = parseChatText(dto?.content, 2000);
    return this.insertMessage(tripId, userId, 'text', content);
  }

  async sendImage(
    userId: number,
    tripId: number,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<ChatMessage> {
    await this.requireChatTrip(userId, tripId);
    if (file.size > 2 * 1024 * 1024) {
      throw imInvalid('图片不能超过 2MB');
    }
    const ext = imageExt(file.mimetype);
    if (!ext) {
      throw imInvalid('请上传 jpg/png/webp 图片');
    }
    await mkdir(CHAT_DIR, { recursive: true });
    const filename = `${tripId}_${userId}_${Date.now()}${ext}`;
    await writeFile(join(CHAT_DIR, filename), file.buffer);
    return this.insertMessage(tripId, userId, 'image', `/files/chat/${filename}`);
  }

  async markRead(userId: number, tripId: number, lastMessageId?: number): Promise<null> {
    await this.requireChatTrip(userId, tripId);
    let cursor = Number(lastMessageId || 0);
    if (!Number.isInteger(cursor) || cursor < 0) {
      cursor = 0;
    }
    if (!cursor) {
      const latest = await this.db.query<RowDataPacket>(
        'SELECT MAX(id) AS id FROM im_messages WHERE trip_id = ?',
        [tripId],
      );
      cursor = Number(latest[0]?.id || 0);
    }
    await this.db.exec(
      `INSERT INTO im_read_cursors (trip_id, user_id, last_read_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_id = GREATEST(last_read_id, VALUES(last_read_id))`,
      [tripId, userId, cursor],
    );
    this.hub.emitRead(tripId, userId, cursor);
    return null;
  }

  async listLiveMemberIds(tripId: number): Promise<number[]> {
    const rows = await this.db.query<RowDataPacket>(
      `SELECT user_id FROM trip_members
       WHERE trip_id = ? AND status IN ('approved', 'leave_pending')`,
      [tripId],
    );
    return rows.map((row) => Number(row.user_id));
  }

  private async readCursorMap(tripId: number): Promise<Map<number, number>> {
    const rows = await this.db.query<RowDataPacket>(
      'SELECT user_id, last_read_id FROM im_read_cursors WHERE trip_id = ?',
      [tripId],
    );
    return new Map(rows.map((row) => [Number(row.user_id), Number(row.last_read_id || 0)]));
  }

  private toReadCursors(
    liveUserIds: number[],
    cursors: Map<number, number>,
    viewerId: number,
  ): ChatReadCursor[] {
    return liveUserIds
      .filter((userId) => userId !== viewerId)
      .map((userId) => ({ userId, lastReadId: cursors.get(userId) || 0 }));
  }

  async unreadTotal(userId: number): Promise<number> {
    const rows = await this.listConversations(userId);
    return rows.reduce((sum, item) => sum + item.unreadCount, 0);
  }

  async assertCanChat(userId: number, tripId: number): Promise<void> {
    await this.requireChatTrip(userId, tripId);
  }

  private async onTripEvent(event: TripLifecycleEvent): Promise<void> {
    try {
      if (event.type === 'created') {
        await this.ensureTencentGroup(event.tripId, event.title, event.userId);
        await this.insertSystem(event.tripId, '车队群已创建，入队后会自动进群');
        return;
      }
      if (event.type === 'joined') {
        const nickname = await this.nicknameOf(event.userId);
        const groupId = await this.groupIdOf(event.tripId);
        if (groupId) {
          await this.tencent.addMember(groupId, event.userId);
        } else {
          const trip = await this.findTrip(event.tripId);
          if (trip) {
            await this.ensureTencentGroup(event.tripId, trip.title, event.userId);
          }
        }
        await this.insertSystem(event.tripId, `${nickname} 加入了车队`);
        return;
      }
      if (event.type === 'left') {
        const nickname = await this.nicknameOf(event.userId);
        const groupId = await this.groupIdOf(event.tripId);
        if (groupId) {
          await this.tencent.removeMember(groupId, event.userId);
        }
        await this.insertSystem(
          event.tripId,
          event.reason === 'removed' ? `${nickname} 被移出车队` : `${nickname} 离开了车队`,
        );
        return;
      }
      if (event.type === 'ended') {
        await this.insertSystem(event.tripId, '行程已结束，群聊继续保留');
      }
    } catch (error) {
      this.logger.warn(
        `同步群聊失败 ${event.type} trip=${event.tripId} ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async insertSystem(tripId: number, content: string): Promise<ChatMessage> {
    return this.insertMessage(tripId, null, 'system', content);
  }

  private async insertMessage(
    tripId: number,
    senderId: number | null,
    type: ChatMessageTypeValue,
    content: string,
  ): Promise<ChatMessage> {
    const createdAt = new Date();
    const result = await this.db.exec(
      `INSERT INTO im_messages (trip_id, sender_id, type, content, created_at) VALUES (?, ?, ?, ?, ?)`,
      [tripId, senderId, type, content, toMysqlDateTime(createdAt)],
    );
    const id = Number((result as ResultSetHeader).insertId);
    const profile = senderId ? await this.profileOf(senderId) : { nickname: '系统', avatarUrl: null };
    const message: ChatMessage = {
      id,
      tripId,
      senderId,
      senderNickname: profile.nickname,
      senderAvatarUrl: profile.avatarUrl,
      type,
      content,
      createdAt: createdAt.toISOString(),
      mine: false,
      readCount: 0,
    };
    this.hub.emit(tripId, { ...message });
    return { ...message, mine: senderId !== null };
  }

  private async toConversation(
    tripId: number,
    trip: TripRow,
    userId: number,
    withCursors: boolean,
  ): Promise<ChatConversation> {
    const [lastRows, unreadRows, memberRows, liveUserIds, cursors] = await Promise.all([
      this.db.query<MessageRow>(
        `SELECT m.*, u.nickname, u.avatar_url
         FROM im_messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.trip_id = ?
         ORDER BY m.id DESC LIMIT 1`,
        [tripId],
      ),
      this.db.query<RowDataPacket>(
        `SELECT COUNT(*) AS total
         FROM im_messages m
         LEFT JOIN im_read_cursors c ON c.trip_id = m.trip_id AND c.user_id = ?
         WHERE m.trip_id = ?
           AND m.id > COALESCE(c.last_read_id, 0)
           AND (m.sender_id IS NULL OR m.sender_id <> ?)`,
        [userId, tripId, userId],
      ),
      this.db.query<RowDataPacket>(
        `SELECT COUNT(*) AS total FROM trip_members
         WHERE trip_id = ? AND status IN ('approved', 'leave_pending')`,
        [tripId],
      ),
      withCursors ? this.listLiveMemberIds(tripId) : Promise.resolve([] as number[]),
      withCursors ? this.readCursorMap(tripId) : Promise.resolve(new Map<number, number>()),
    ]);
    const last = lastRows[0]
      ? this.toMessage(lastRows[0], userId, liveUserIds, cursors)
      : null;
    return {
      tripId,
      title: trip.title,
      tripStatus: trip.status,
      lastMessage: last,
      unreadCount: Number(unreadRows[0]?.total || 0),
      memberCount: Number(memberRows[0]?.total || 0),
      updatedAt: last?.createdAt || toIso(trip.updated_at || new Date()),
      readCursors: this.toReadCursors(liveUserIds, cursors, userId),
    };
  }

  private toMessage(
    row: MessageRow,
    viewerId: number,
    liveUserIds: number[],
    cursors: Map<number, number>,
  ): ChatMessage {
    const senderId = row.sender_id == null ? null : Number(row.sender_id);
    const id = Number(row.id);
    return {
      id,
      tripId: Number(row.trip_id),
      senderId,
      senderNickname: row.nickname || (senderId ? '同路人' : '系统'),
      senderAvatarUrl: row.avatar_url ?? null,
      type: row.type,
      content: row.content,
      createdAt: toIso(row.created_at),
      mine: senderId === viewerId,
      readCount: countMessageReaders(id, senderId, liveUserIds, cursors),
    };
  }

  private async requireChatTrip(userId: number, tripId: number): Promise<TripRow> {
    const trip = await this.findTrip(tripId);
    if (!trip) {
      throw new BusinessException(ErrorCode.TRIP_NOT_FOUND, '行程不存在');
    }
    const member = await this.findMember(tripId, userId);
    if (!isLiveMemberStatus(member?.status as MemberStatusValue | undefined)) {
      throw imForbidden('加入车队后才能进群');
    }
    return trip;
  }

  private async findTrip(tripId: number): Promise<TripRow | null> {
    const rows = await this.db.query<TripRow>(
      'SELECT id, title, status, im_group_id, updated_at FROM trips WHERE id = ? LIMIT 1',
      [tripId],
    );
    return rows[0] ?? null;
  }

  private async findMember(tripId: number, userId: number): Promise<MemberRow | null> {
    const rows = await this.db.query<MemberRow>(
      `SELECT m.user_id, u.nickname, u.avatar_url, m.status
       FROM trip_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.trip_id = ? AND m.user_id = ?
       LIMIT 1`,
      [tripId, userId],
    );
    return rows[0] ?? null;
  }

  private async nicknameOf(userId: number): Promise<string> {
    const profile = await this.profileOf(userId);
    return profile.nickname;
  }

  private async profileOf(userId: number): Promise<{ nickname: string; avatarUrl: string | null }> {
    const rows = await this.db.query<RowDataPacket>(
      'SELECT nickname, avatar_url FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    return {
      nickname: String(rows[0]?.nickname || '同路人'),
      avatarUrl: (rows[0]?.avatar_url as string | null) ?? null,
    };
  }

  private async groupIdOf(tripId: number): Promise<string | null> {
    const trip = await this.findTrip(tripId);
    return trip?.im_group_id || null;
  }

  private async ensureTencentGroup(tripId: number, title: string, ownerUserId: number): Promise<void> {
    const existing = await this.groupIdOf(tripId);
    if (existing || !this.tencent.isEnabled()) {
      if (existing) {
        await this.tencent.addMember(existing, ownerUserId);
      }
      return;
    }
    const groupId = await this.tencent.ensureGroup(tripId, title, ownerUserId);
    if (groupId) {
      await this.db.exec('UPDATE trips SET im_group_id = ? WHERE id = ? AND (im_group_id IS NULL OR im_group_id = "")', [
        groupId,
        tripId,
      ]);
    }
  }
}
