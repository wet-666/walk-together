import { Injectable } from '@nestjs/common';
import {
  CopyVisibility,
  ErrorCode,
  MemberRole,
  MemberStatus,
  TripNodeKind,
  TripPrivacy,
  TripStatus,
  type AlongPlanValue,
  type ApplyJoinDto,
  type CompanionDepthValue,
  type CopyVisibilityValue,
  type CreateTripDto,
  type MemberStatusValue,
  type TripCopy,
  type TripDetail,
  type TripMember,
  type TripNode,
  type TripPlaceInput,
  type TripPrivacyValue,
  type TripStatusValue,
  type TripSummary,
  type UpdateCopyDto,
  type UpdateTripDto,
} from '@walk-together/shared-types';
import type { RowDataPacket } from 'mysql2';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService, type DbOps } from '../../common/database/database.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AmapService } from './amap.service';
import { TripEventHub } from './trip-event.hub';
import {
  asNodeKind,
  assertAnnouncement,
  assertApplyMessage,
  canReapply,
  createInviteCode,
  csv,
  haversineKm,
  isLiveMemberStatus,
  isOpenStatus,
  mergeUpdate,
  normalizeCreate,
  splitCsv,
  toCoord,
  toMysqlDateTime,
  tripInvalid,
} from './trip.util';

type TripRow = RowDataPacket & {
  id: number | string;
  captain_id: number | string;
  captain_nickname?: string;
  title: string;
  origin_name: string;
  origin_lng: number | string | null;
  origin_lat: number | string | null;
  dest_name: string;
  dest_lng: number | string | null;
  dest_lat: number | string | null;
  depart_at: Date | string;
  estimated_days: number;
  daily_mileage: number | null;
  companion_depth: CompanionDepthValue;
  along_plans: string | null;
  max_vehicles: number;
  vehicle_count?: number | string;
  privacy: TripPrivacyValue;
  allow_copy: number;
  cover_url: string | null;
  fee_note: string | null;
  tags: string | null;
  announcement: string | null;
  invite_code: string;
  status: TripStatusValue;
  created_at: Date | string;
  my_status?: MemberStatusValue | null;
};

type NodeRow = RowDataPacket & {
  id: number | string;
  seq: number;
  kind: string;
  name: string;
  lng: number | string | null;
  lat: number | string | null;
};

type MemberRow = RowDataPacket & {
  user_id: number | string;
  nickname: string;
  avatar_url: string | null;
  vehicle_model: string | null;
  plate_number: string | null;
  role: string;
  status: MemberStatusValue;
  apply_message: string | null;
  created_at: Date | string;
};

type CopyRow = RowDataPacket & {
  id: number | string;
  trip_id: number | string;
  user_id: number | string;
  visibility: CopyVisibilityValue;
};

const COVER_DIR = join(process.cwd(), 'uploads', 'covers');

@Injectable()
export class TripService {
  constructor(
    private readonly db: DatabaseService,
    private readonly amap: AmapService,
    private readonly events: TripEventHub,
  ) {}

  async listPlaza(query: {
    keyword?: string;
    code?: string;
    lng?: number;
    lat?: number;
    sort?: 'time' | 'distance';
    nearby?: boolean;
    userId?: number | null;
  }): Promise<TripSummary[]> {
    const code = (query.code ?? '').trim().toUpperCase();
    if (code) {
      const found = await this.findByInviteCode(code);
      if (!found) {
        return [];
      }
      const summaries = await this.toSummaries([found], query);
      return summaries;
    }

    const params: Array<string | number> = [];
    let sql = `
      SELECT t.*, u.nickname AS captain_nickname,
        (SELECT COUNT(*) FROM trip_members m
          WHERE m.trip_id = t.id AND m.status IN ('approved', 'leave_pending')) AS vehicle_count
      FROM trips t
      JOIN users u ON u.id = t.captain_id
      WHERE t.status = 'recruiting' AND t.privacy = 'public'
    `;
    const keyword = (query.keyword ?? '').trim();
    if (keyword) {
      sql += ' AND (t.title LIKE ? OR t.origin_name LIKE ? OR t.dest_name LIKE ?)';
      const like = `%${keyword}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY t.depart_at ASC LIMIT 50';
    const rows = await this.db.query<TripRow>(sql, params);
    return this.toSummaries(rows, query);
  }

  async listMine(userId: number): Promise<TripSummary[]> {
    const rows = await this.db.query<TripRow>(
      `SELECT t.*, u.nickname AS captain_nickname,
         (SELECT COUNT(*) FROM trip_members m
           WHERE m.trip_id = t.id AND m.status IN ('approved', 'leave_pending')) AS vehicle_count,
         mine.status AS my_status
       FROM trip_members mine
       JOIN trips t ON t.id = mine.trip_id
       JOIN users u ON u.id = t.captain_id
       WHERE mine.user_id = ?
         AND mine.status IN ('approved', 'pending', 'leave_pending')
       ORDER BY t.depart_at ASC`,
      [userId],
    );
    return this.toSummaries(rows, { userId });
  }

  async getLiveMapContext(
    userId: number,
    tripId?: number,
  ): Promise<{
    tripId: number;
    title: string;
    status: TripStatusValue;
    originName: string;
    destName: string;
    nodes: TripNode[];
    members: TripMember[];
  } | null> {
    const trip = tripId ? await this.requireTrip(tripId) : await this.findActiveLiveTrip(userId);
    if (!trip) {
      return null;
    }
    if (!isOpenStatus(trip.status)) {
      throw new BusinessException(ErrorCode.TRIP_FORBIDDEN, '行程已结束，不再同步位置');
    }
    const member = await this.findMember(Number(trip.id), userId);
    if (!isLiveMemberStatus(member?.status)) {
      throw new BusinessException(ErrorCode.TRIP_FORBIDDEN, '加入车队后才能看本队地图');
    }
    const [nodes, members] = await Promise.all([
      this.listNodes(Number(trip.id)),
      this.listMembers(Number(trip.id)),
    ]);
    return {
      tripId: Number(trip.id),
      title: trip.title,
      status: trip.status,
      originName: trip.origin_name,
      destName: trip.dest_name,
      nodes,
      members: members.filter((item) => isLiveMemberStatus(item.status)),
    };
  }

  async create(userId: number, dto: CreateTripDto): Promise<TripDetail> {
    const input = normalizeCreate(dto);
    const origin = await this.amap.fillPlace(input.origin);
    const destination = await this.amap.fillPlace(input.destination);
    const waypoints = await Promise.all(input.waypoints.map((item) => this.amap.fillPlace(item)));
    const tripId = await this.db.withTransaction(async (ops) => {
      const inviteCode = await this.uniqueInviteCode(ops);
      const result = await ops.exec(
        `INSERT INTO trips (
          captain_id, title, origin_name, origin_lng, origin_lat,
          dest_name, dest_lng, dest_lat, depart_at, estimated_days, daily_mileage,
          companion_depth, along_plans, max_vehicles, privacy, allow_copy,
          fee_note, tags, announcement, invite_code, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiting')`,
        [
          userId,
          input.title,
          origin.name,
          origin.lng ?? null,
          origin.lat ?? null,
          destination.name,
          destination.lng ?? null,
          destination.lat ?? null,
          toMysqlDateTime(input.departAt),
          input.estimatedDays,
          input.dailyMileage,
          input.companionDepth,
          csv(input.alongPlans),
          input.maxVehicles,
          input.privacy,
          input.allowCopy ? 1 : 0,
          input.feeNote,
          csv(input.tags),
          input.announcement,
          inviteCode,
        ],
      );
      const id = Number(result.insertId);
      await this.replaceNodes(ops, id, origin, waypoints, destination);
      await ops.exec(
        `INSERT INTO trip_members (trip_id, user_id, role, status)
         VALUES (?, ?, 'captain', 'approved')`,
        [id, userId],
      );
      await this.createCopyFromTrip(ops, id, userId, origin, waypoints, destination);
      return id;
    });
    this.events.emit({ type: 'created', tripId, userId, title: input.title });
    return this.detail(tripId, userId);
  }

  async update(userId: number, tripId: number, dto: UpdateTripDto): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    this.assertCaptain(trip, userId);
    if (trip.status !== TripStatus.RECRUITING) {
      throw tripInvalid('只有招募中的行程可以编辑');
    }
    const current = this.asCreateShape(trip, await this.listNodes(tripId));
    const input = mergeUpdate(dto, current);
    const approved = await this.approvedCount(tripId);
    if (input.maxVehicles < approved) {
      throw tripInvalid(`人数上限不能小于已加入的 ${approved} 辆`);
    }
    const origin = await this.amap.fillPlace(input.origin);
    const destination = await this.amap.fillPlace(input.destination);
    const waypoints = await Promise.all(input.waypoints.map((item) => this.amap.fillPlace(item)));

    await this.db.withTransaction(async (ops) => {
      await ops.exec(
        `UPDATE trips SET
          title = ?, origin_name = ?, origin_lng = ?, origin_lat = ?,
          dest_name = ?, dest_lng = ?, dest_lat = ?, depart_at = ?, estimated_days = ?,
          daily_mileage = ?, companion_depth = ?, along_plans = ?, max_vehicles = ?,
          privacy = ?, allow_copy = ?, fee_note = ?, tags = ?, announcement = ?
         WHERE id = ?`,
        [
          input.title,
          origin.name,
          origin.lng ?? null,
          origin.lat ?? null,
          destination.name,
          destination.lng ?? null,
          destination.lat ?? null,
          toMysqlDateTime(input.departAt),
          input.estimatedDays,
          input.dailyMileage,
          input.companionDepth,
          csv(input.alongPlans),
          input.maxVehicles,
          input.privacy,
          input.allowCopy ? 1 : 0,
          input.feeNote,
          csv(input.tags),
          input.announcement,
          tripId,
        ],
      );
      await this.replaceNodes(ops, tripId, origin, waypoints, destination);
    });
    return this.detail(tripId, userId);
  }

  async saveCover(
    userId: number,
    tripId: number,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    this.assertCaptain(trip, userId);
    if (file.size > 2 * 1024 * 1024) {
      throw tripInvalid('封面不能超过 2MB');
    }
    const ext = this.imageExt(file.mimetype);
    if (!ext) {
      throw tripInvalid('请上传 jpg/png/webp 图片');
    }
    await mkdir(COVER_DIR, { recursive: true });
    const filename = `${tripId}_${Date.now()}${ext}`;
    await writeFile(join(COVER_DIR, filename), file.buffer);
    await this.db.exec('UPDATE trips SET cover_url = ? WHERE id = ?', [
      `/files/covers/${filename}`,
      tripId,
    ]);
    return this.detail(tripId, userId);
  }

  async setAnnouncement(userId: number, tripId: number, announcement: string): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    this.assertCaptain(trip, userId);
    await this.db.exec('UPDATE trips SET announcement = ? WHERE id = ?', [
      assertAnnouncement(announcement),
      tripId,
    ]);
    return this.detail(tripId, userId);
  }

  async start(userId: number, tripId: number): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    this.assertCaptain(trip, userId);
    if (trip.status !== TripStatus.RECRUITING) {
      throw tripInvalid('只有招募中的行程可以开始');
    }
    await this.db.exec(`UPDATE trips SET status = 'ongoing' WHERE id = ?`, [tripId]);
    return this.detail(tripId, userId);
  }

  async end(userId: number, tripId: number): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    this.assertCaptain(trip, userId);
    if (!isOpenStatus(trip.status)) {
      throw tripInvalid('行程已结束');
    }
    await this.db.exec(`UPDATE trips SET status = 'ended' WHERE id = ?`, [tripId]);
    this.events.emit({ type: 'ended', tripId });
    return this.detail(tripId, userId);
  }

  async cancel(userId: number, tripId: number): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    this.assertCaptain(trip, userId);
    if (trip.status === TripStatus.ENDED || trip.status === TripStatus.CANCELLED) {
      throw tripInvalid('行程已结束');
    }
    await this.db.exec(`UPDATE trips SET status = 'cancelled' WHERE id = ?`, [tripId]);
    return this.detail(tripId, userId);
  }

  async detail(tripId: number, userId: number | null, code?: string): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    const myMember = userId ? await this.findMember(tripId, userId) : null;
    this.assertCanView(trip, myMember, code);
    const [nodes, members] = await Promise.all([
      this.listNodes(tripId),
      this.listMembers(tripId),
    ]);
    const approved = members.filter(
      (item) => item.status === MemberStatus.APPROVED || item.status === MemberStatus.LEAVE_PENDING,
    );
    const applications = members.filter(
      (item) =>
        item.status === MemberStatus.PENDING || item.status === MemberStatus.LEAVE_PENDING,
    );
    const isCaptain = Number(trip.captain_id) === userId;
    return {
      id: Number(trip.id),
      captainId: Number(trip.captain_id),
      captainNickname: String(trip.captain_nickname || ''),
      title: trip.title,
      originName: trip.origin_name,
      originLng: toCoord(trip.origin_lng),
      originLat: toCoord(trip.origin_lat),
      destName: trip.dest_name,
      destLng: toCoord(trip.dest_lng),
      destLat: toCoord(trip.dest_lat),
      departAt: this.toIso(trip.depart_at),
      estimatedDays: Number(trip.estimated_days),
      dailyMileage: trip.daily_mileage === null ? null : Number(trip.daily_mileage),
      companionDepth: trip.companion_depth,
      alongPlans: splitCsv<AlongPlanValue>(trip.along_plans),
      maxVehicles: Number(trip.max_vehicles),
      vehicleCount: approved.length,
      privacy: trip.privacy,
      allowCopy: Number(trip.allow_copy) === 1,
      coverUrl: trip.cover_url,
      feeNote: trip.fee_note,
      tags: splitCsv(trip.tags),
      announcement: trip.announcement,
      inviteCode: isCaptain || myMember?.status === MemberStatus.APPROVED ? trip.invite_code : '',
      status: trip.status,
      createdAt: this.toIso(trip.created_at),
      nodes,
      members: isCaptain ? members : approved,
      applications: isCaptain ? applications : [],
      myMember,
      isFull: approved.length >= Number(trip.max_vehicles),
    };
  }

  async apply(userId: number, tripId: number, dto: ApplyJoinDto): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    if (trip.status !== TripStatus.RECRUITING) {
      throw tripInvalid('该行程当前不接受申请');
    }
    if (Number(trip.captain_id) === userId) {
      throw new BusinessException(ErrorCode.TRIP_ALREADY_MEMBER, '不能申请加入自己的行程');
    }
    const approved = await this.approvedCount(tripId);
    if (approved >= Number(trip.max_vehicles)) {
      throw new BusinessException(ErrorCode.TRIP_FULL, '车队已满员');
    }
    const existing = await this.findMember(tripId, userId);
    if (existing?.status === MemberStatus.PENDING) {
      throw new BusinessException(ErrorCode.TRIP_APPLY_INVALID, '已提交申请，请等待队长审批');
    }
    if (existing?.status === MemberStatus.APPROVED || existing?.status === MemberStatus.LEAVE_PENDING) {
      throw new BusinessException(ErrorCode.TRIP_ALREADY_MEMBER, '你已经在这支队伍里');
    }
    if (existing && !canReapply(existing.status)) {
      throw new BusinessException(ErrorCode.TRIP_APPLY_INVALID, '当前状态不能再次申请');
    }
    const message = assertApplyMessage(dto.message);
    if (existing) {
      await this.db.exec(
        `UPDATE trip_members
         SET role = 'member', status = 'pending', apply_message = ?
         WHERE trip_id = ? AND user_id = ?`,
        [message, tripId, userId],
      );
    } else {
      await this.db.exec(
        `INSERT INTO trip_members (trip_id, user_id, role, status, apply_message)
         VALUES (?, ?, 'member', 'pending', ?)`,
        [tripId, userId, message],
      );
    }
    return this.detail(tripId, userId);
  }

  async decide(
    captainId: number,
    tripId: number,
    targetUserId: number,
    action: 'approve' | 'reject',
  ): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    this.assertCaptain(trip, captainId);
    const member = await this.requireMemberRow(tripId, targetUserId);
    if (member.status !== MemberStatus.PENDING && member.status !== MemberStatus.LEAVE_PENDING) {
      throw tripInvalid('没有待处理的申请');
    }

    if (member.status === MemberStatus.LEAVE_PENDING) {
      await this.db.exec(
        `UPDATE trip_members SET status = ? WHERE trip_id = ? AND user_id = ?`,
        [action === 'approve' ? MemberStatus.LEFT : MemberStatus.APPROVED, tripId, targetUserId],
      );
      if (action === 'approve') {
        this.events.emit({ type: 'left', tripId, userId: targetUserId, reason: 'left' });
      }
      return this.detail(tripId, captainId);
    }

    if (action === 'reject') {
      await this.db.exec(
        `UPDATE trip_members SET status = 'rejected' WHERE trip_id = ? AND user_id = ?`,
        [tripId, targetUserId],
      );
      return this.detail(tripId, captainId);
    }

    const approved = await this.approvedCount(tripId);
    if (approved >= Number(trip.max_vehicles)) {
      throw new BusinessException(ErrorCode.TRIP_FULL, '车队已满员');
    }

    await this.db.withTransaction(async (ops) => {
      await ops.exec(
        `UPDATE trip_members SET status = 'approved', role = 'member'
         WHERE trip_id = ? AND user_id = ?`,
        [tripId, targetUserId],
      );
      const exists = await ops.query<CopyRow>(
        'SELECT id FROM trip_copies WHERE trip_id = ? AND user_id = ? LIMIT 1',
        [tripId, targetUserId],
      );
      if (!exists[0]) {
        const nodes = await this.listNodesWith(ops, tripId);
        await this.createCopyFromNodes(ops, tripId, targetUserId, nodes);
      }
    });
    this.events.emit({ type: 'joined', tripId, userId: targetUserId });
    return this.detail(tripId, captainId);
  }

  async leave(userId: number, tripId: number): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    if (Number(trip.captain_id) === userId) {
      throw tripInvalid('队长请解散行程，而不是退出');
    }
    const member = await this.requireMemberRow(tripId, userId);
    if (member.status === MemberStatus.PENDING) {
      await this.db.exec(
        `UPDATE trip_members SET status = 'left' WHERE trip_id = ? AND user_id = ?`,
        [tripId, userId],
      );
      return this.detail(tripId, userId);
    }
    if (member.status !== MemberStatus.APPROVED) {
      throw tripInvalid('当前不能申请退出');
    }
    await this.db.exec(
      `UPDATE trip_members SET status = 'leave_pending' WHERE trip_id = ? AND user_id = ?`,
      [tripId, userId],
    );
    return this.detail(tripId, userId);
  }

  async removeMember(captainId: number, tripId: number, targetUserId: number): Promise<TripDetail> {
    const trip = await this.requireTrip(tripId);
    this.assertCaptain(trip, captainId);
    if (targetUserId === captainId) {
      throw tripInvalid('不能移除队长');
    }
    const member = await this.requireMemberRow(tripId, targetUserId);
    if (member.status !== MemberStatus.APPROVED && member.status !== MemberStatus.LEAVE_PENDING) {
      throw tripInvalid('该用户不在队伍中');
    }
    await this.db.exec(
      `UPDATE trip_members SET status = 'removed' WHERE trip_id = ? AND user_id = ?`,
      [tripId, targetUserId],
    );
    this.events.emit({ type: 'left', tripId, userId: targetUserId, reason: 'removed' });
    return this.detail(tripId, captainId);
  }

  async getCopy(userId: number, tripId: number): Promise<TripCopy> {
    const trip = await this.requireTrip(tripId);
    const member = await this.findMember(tripId, userId);
    if (member?.status !== MemberStatus.APPROVED && member?.status !== MemberStatus.LEAVE_PENDING) {
      throw new BusinessException(ErrorCode.TRIP_FORBIDDEN, '加入队伍后才能查看个人副本');
    }
    const copy = await this.requireCopy(tripId, userId);
    const nodes = await this.listCopyNodes(Number(copy.id));
    return {
      tripId: Number(trip.id),
      userId,
      visibility: copy.visibility,
      nodes,
    };
  }

  async updateCopy(userId: number, tripId: number, dto: UpdateCopyDto): Promise<TripCopy> {
    const trip = await this.requireTrip(tripId);
    if (Number(trip.allow_copy) !== 1) {
      throw tripInvalid('该行程不允许队员改个人副本');
    }
    const member = await this.findMember(tripId, userId);
    if (member?.status !== MemberStatus.APPROVED) {
      throw new BusinessException(ErrorCode.TRIP_FORBIDDEN, '只有队员可以改个人副本');
    }
    const copy = await this.requireCopy(tripId, userId);
    const visibility =
      dto.visibility === CopyVisibility.PUBLIC ? CopyVisibility.PUBLIC : CopyVisibility.PRIVATE;
    await this.db.exec('UPDATE trip_copies SET visibility = ? WHERE id = ?', [
      visibility,
      copy.id,
    ]);
    if (dto.waypoints) {
      const origin = await this.nodeByKind(tripId, TripNodeKind.ORIGIN);
      const dest = await this.nodeByKind(tripId, TripNodeKind.DEST);
      if (!origin || !dest) {
        throw tripInvalid('主行程路线不完整');
      }
      if (dto.waypoints.length > 5) {
        throw tripInvalid('途经点最多 5 个');
      }
      const waypoints = await Promise.all(
        dto.waypoints.map((item, index) =>
          this.amap.fillPlace({
            name: (item.name ?? '').trim(),
            lng: item.lng,
            lat: item.lat,
          }).then((place) => {
            if (place.name.length < 2) {
              throw tripInvalid(`途经点${index + 1}请输入 2–64 个字`);
            }
            return place;
          }),
        ),
      );
      await this.db.withTransaction(async (ops) => {
        await ops.exec('DELETE FROM trip_copy_nodes WHERE copy_id = ?', [copy.id]);
        await this.insertCopyNodes(ops, Number(copy.id), origin, waypoints, dest);
      });
    }
    return this.getCopy(userId, tripId);
  }

  private async toSummaries(
    rows: TripRow[],
    query: { lng?: number; lat?: number; sort?: 'time' | 'distance'; nearby?: boolean; userId?: number | null },
  ): Promise<TripSummary[]> {
    const myStatus = new Map<number, MemberStatusValue>();
    if (query.userId && rows.length) {
      const ids = rows.map((row) => Number(row.id));
      const placeholders = ids.map(() => '?').join(',');
      const mine = await this.db.query<RowDataPacket & { trip_id: number | string; status: MemberStatusValue }>(
        `SELECT trip_id, status FROM trip_members WHERE user_id = ? AND trip_id IN (${placeholders})`,
        [query.userId, ...ids],
      );
      for (const item of mine) {
        myStatus.set(Number(item.trip_id), item.status);
      }
    }

    const items = rows.map((row) => {
      const originLng = toCoord(row.origin_lng);
      const originLat = toCoord(row.origin_lat);
      const distanceKm =
        query.lng != null && query.lat != null && originLng != null && originLat != null
          ? haversineKm(query.lng, query.lat, originLng, originLat)
          : null;
      return {
        id: Number(row.id),
        title: row.title,
        originName: row.origin_name,
        destName: row.dest_name,
        departAt: this.toIso(row.depart_at),
        vehicleCount: Number(row.vehicle_count ?? 0),
        maxVehicles: Number(row.max_vehicles),
        coverUrl: row.cover_url,
        captainNickname: String(row.captain_nickname || ''),
        privacy: row.privacy,
        status: row.status,
        distanceKm,
        tags: splitCsv(row.tags),
        myStatus: (row.my_status as MemberStatusValue | undefined) ?? myStatus.get(Number(row.id)) ?? null,
      } satisfies TripSummary;
    });

    const filtered = query.nearby
      ? items.filter((item) => item.distanceKm != null && item.distanceKm <= 10)
      : items;
    if (query.sort === 'distance') {
      filtered.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) {
          return 0;
        }
        if (a.distanceKm == null) {
          return 1;
        }
        if (b.distanceKm == null) {
          return -1;
        }
        return a.distanceKm - b.distanceKm;
      });
    }
    return filtered;
  }

  private async findActiveLiveTrip(userId: number): Promise<TripRow | null> {
    const rows = await this.db.query<TripRow>(
      `SELECT t.*, u.nickname AS captain_nickname
       FROM trip_members mine
       JOIN trips t ON t.id = mine.trip_id
       JOIN users u ON u.id = t.captain_id
       WHERE mine.user_id = ?
         AND mine.status IN ('approved', 'leave_pending')
         AND t.status IN ('recruiting', 'ongoing')
       ORDER BY CASE t.status WHEN 'ongoing' THEN 0 ELSE 1 END, t.depart_at ASC
       LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async requireTrip(tripId: number): Promise<TripRow> {
    const rows = await this.db.query<TripRow>(
      `SELECT t.*, u.nickname AS captain_nickname
       FROM trips t
       JOIN users u ON u.id = t.captain_id
       WHERE t.id = ? LIMIT 1`,
      [tripId],
    );
    if (!rows[0]) {
      throw new BusinessException(ErrorCode.TRIP_NOT_FOUND, '行程不存在');
    }
    return rows[0];
  }

  private async findByInviteCode(code: string): Promise<TripRow | null> {
    const rows = await this.db.query<TripRow>(
      `SELECT t.*, u.nickname AS captain_nickname,
         (SELECT COUNT(*) FROM trip_members m
           WHERE m.trip_id = t.id AND m.status IN ('approved', 'leave_pending')) AS vehicle_count
       FROM trips t
       JOIN users u ON u.id = t.captain_id
       WHERE t.invite_code = ? LIMIT 1`,
      [code],
    );
    return rows[0] ?? null;
  }

  private assertCaptain(trip: TripRow, userId: number): void {
    if (Number(trip.captain_id) !== userId) {
      throw new BusinessException(ErrorCode.TRIP_FORBIDDEN, '只有队长可以操作');
    }
  }

  private assertCanView(
    trip: TripRow,
    myMember: TripMember | null,
    code?: string,
  ): void {
    if (trip.privacy === TripPrivacy.PUBLIC) {
      return;
    }
    if (myMember && myMember.status !== MemberStatus.REJECTED) {
      return;
    }
    if (code && code.trim().toUpperCase() === trip.invite_code) {
      return;
    }
    throw new BusinessException(ErrorCode.TRIP_NOT_FOUND, '行程不存在');
  }

  private async listNodes(tripId: number): Promise<TripNode[]> {
    return this.listNodesWith(this.db, tripId);
  }

  private async listNodesWith(ops: DbOps, tripId: number): Promise<TripNode[]> {
    const rows = await ops.query<NodeRow>(
      'SELECT id, seq, kind, name, lng, lat FROM trip_nodes WHERE trip_id = ? ORDER BY seq ASC',
      [tripId],
    );
    return rows.map((row) => this.toNode(row));
  }

  private async listCopyNodes(copyId: number): Promise<TripNode[]> {
    const rows = await this.db.query<NodeRow>(
      'SELECT id, seq, kind, name, lng, lat FROM trip_copy_nodes WHERE copy_id = ? ORDER BY seq ASC',
      [copyId],
    );
    return rows.map((row) => this.toNode(row));
  }

  private async listMembers(tripId: number): Promise<TripMember[]> {
    const rows = await this.db.query<MemberRow>(
      `SELECT m.user_id, m.role, m.status, m.apply_message, m.created_at,
              u.nickname, u.avatar_url, u.vehicle_model, u.plate_number
       FROM trip_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.trip_id = ?
       ORDER BY m.role ASC, m.created_at ASC`,
      [tripId],
    );
    return rows.map((row) => this.toMember(row));
  }

  private async findMember(tripId: number, userId: number): Promise<TripMember | null> {
    const rows = await this.db.query<MemberRow>(
      `SELECT m.user_id, m.role, m.status, m.apply_message, m.created_at,
              u.nickname, u.avatar_url, u.vehicle_model, u.plate_number
       FROM trip_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.trip_id = ? AND m.user_id = ?
       LIMIT 1`,
      [tripId, userId],
    );
    return rows[0] ? this.toMember(rows[0]) : null;
  }

  private async requireMemberRow(tripId: number, userId: number): Promise<TripMember> {
    const member = await this.findMember(tripId, userId);
    if (!member) {
      throw tripInvalid('没有这条申请');
    }
    return member;
  }

  private async approvedCount(tripId: number): Promise<number> {
    const rows = await this.db.query<RowDataPacket & { total: number | string }>(
      `SELECT COUNT(*) AS total FROM trip_members
       WHERE trip_id = ? AND status IN ('approved', 'leave_pending')`,
      [tripId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async uniqueInviteCode(ops: DbOps): Promise<string> {
    for (let i = 0; i < 8; i += 1) {
      const code = createInviteCode();
      const rows = await ops.query<RowDataPacket>(
        'SELECT id FROM trips WHERE invite_code = ? LIMIT 1',
        [code],
      );
      if (!rows[0]) {
        return code;
      }
    }
    throw tripInvalid('邀请码生成失败，请重试');
  }

  private async replaceNodes(
    ops: DbOps,
    tripId: number,
    origin: TripPlaceInput,
    waypoints: TripPlaceInput[],
    destination: TripPlaceInput,
  ): Promise<void> {
    await ops.exec('DELETE FROM trip_nodes WHERE trip_id = ?', [tripId]);
    const nodes = [
      { ...origin, kind: TripNodeKind.ORIGIN },
      ...waypoints.map((item) => ({ ...item, kind: TripNodeKind.WAYPOINT })),
      { ...destination, kind: TripNodeKind.DEST },
    ];
    for (const [index, node] of nodes.entries()) {
      await ops.exec(
        `INSERT INTO trip_nodes (trip_id, seq, kind, name, lng, lat)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tripId, index + 1, node.kind, node.name, node.lng ?? null, node.lat ?? null],
      );
    }
  }

  private async createCopyFromTrip(
    ops: DbOps,
    tripId: number,
    userId: number,
    origin: TripPlaceInput,
    waypoints: TripPlaceInput[],
    destination: TripPlaceInput,
  ): Promise<void> {
    const result = await ops.exec(
      `INSERT INTO trip_copies (trip_id, user_id, visibility) VALUES (?, ?, 'private')`,
      [tripId, userId],
    );
    await this.insertCopyNodes(ops, Number(result.insertId), origin, waypoints, destination);
  }

  private async createCopyFromNodes(
    ops: DbOps,
    tripId: number,
    userId: number,
    nodes: TripNode[],
  ): Promise<void> {
    const origin = nodes.find((item) => item.kind === TripNodeKind.ORIGIN);
    const dest = nodes.find((item) => item.kind === TripNodeKind.DEST);
    const waypoints = nodes.filter((item) => item.kind === TripNodeKind.WAYPOINT);
    if (!origin || !dest) {
      return;
    }
    await this.createCopyFromTrip(ops, tripId, userId, origin, waypoints, dest);
  }

  private async insertCopyNodes(
    ops: DbOps,
    copyId: number,
    origin: TripPlaceInput,
    waypoints: TripPlaceInput[],
    destination: TripPlaceInput,
  ): Promise<void> {
    const nodes = [
      { ...origin, kind: TripNodeKind.ORIGIN },
      ...waypoints.map((item) => ({ ...item, kind: TripNodeKind.WAYPOINT })),
      { ...destination, kind: TripNodeKind.DEST },
    ];
    for (const [index, node] of nodes.entries()) {
      await ops.exec(
        `INSERT INTO trip_copy_nodes (copy_id, seq, kind, name, lng, lat)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [copyId, index + 1, node.kind, node.name, node.lng ?? null, node.lat ?? null],
      );
    }
  }

  private async requireCopy(tripId: number, userId: number): Promise<CopyRow> {
    const rows = await this.db.query<CopyRow>(
      'SELECT * FROM trip_copies WHERE trip_id = ? AND user_id = ? LIMIT 1',
      [tripId, userId],
    );
    if (!rows[0]) {
      throw new BusinessException(ErrorCode.TRIP_NOT_FOUND, '个人副本还不存在');
    }
    return rows[0];
  }

  private async nodeByKind(tripId: number, kind: string): Promise<TripPlaceInput | null> {
    const rows = await this.db.query<NodeRow>(
      'SELECT name, lng, lat FROM trip_nodes WHERE trip_id = ? AND kind = ? ORDER BY seq ASC LIMIT 1',
      [tripId, kind],
    );
    if (!rows[0]) {
      return null;
    }
    return {
      name: rows[0].name,
      lng: toCoord(rows[0].lng),
      lat: toCoord(rows[0].lat),
    };
  }

  private asCreateShape(trip: TripRow, nodes: TripNode[]): ReturnType<typeof normalizeCreate> {
    return {
      title: trip.title,
      origin: {
        name: trip.origin_name,
        lng: toCoord(trip.origin_lng),
        lat: toCoord(trip.origin_lat),
      },
      destination: {
        name: trip.dest_name,
        lng: toCoord(trip.dest_lng),
        lat: toCoord(trip.dest_lat),
      },
      waypoints: nodes
        .filter((item) => item.kind === TripNodeKind.WAYPOINT)
        .map((item) => ({ name: item.name, lng: item.lng, lat: item.lat })),
      departAt: new Date(trip.depart_at),
      estimatedDays: Number(trip.estimated_days),
      dailyMileage: trip.daily_mileage === null ? null : Number(trip.daily_mileage),
      companionDepth: trip.companion_depth,
      alongPlans: splitCsv<AlongPlanValue>(trip.along_plans),
      maxVehicles: Number(trip.max_vehicles),
      privacy: trip.privacy,
      allowCopy: Number(trip.allow_copy) === 1,
      feeNote: trip.fee_note,
      tags: splitCsv(trip.tags),
      announcement: trip.announcement,
    };
  }

  private toNode(row: NodeRow): TripNode {
    return {
      id: Number(row.id),
      seq: Number(row.seq),
      kind: asNodeKind(row.kind),
      name: row.name,
      lng: toCoord(row.lng),
      lat: toCoord(row.lat),
    };
  }

  private toMember(row: MemberRow): TripMember {
    return {
      userId: Number(row.user_id),
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      vehicleModel: row.vehicle_model,
      plateNumber: row.plate_number,
      role: row.role === MemberRole.CAPTAIN ? MemberRole.CAPTAIN : MemberRole.MEMBER,
      status: row.status,
      applyMessage: row.apply_message,
      joinedAt: this.toIso(row.created_at),
    };
  }

  private imageExt(mimetype: string): string | null {
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

  private toIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}
