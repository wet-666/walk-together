import {
  AlongPlan,
  CompanionDepth,
  ErrorCode,
  MemberStatus,
  TripNodeKind,
  TripPrivacy,
  TripStatus,
  type AlongPlanValue,
  type CompanionDepthValue,
  type CreateTripDto,
  type MemberStatusValue,
  type TripNodeKindValue,
  type TripPlaceInput,
  type TripPrivacyValue,
  type TripStatusValue,
  type UpdateTripDto,
} from '@walk-together/shared-types';
import { randomInt } from 'node:crypto';
import { BusinessException } from '../../common/exceptions/business.exception';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function tripInvalid(message: string): BusinessException {
  return new BusinessException(ErrorCode.TRIP_INVALID, message);
}

export function createInviteCode(length = 6): string {
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return value;
}

export function assertTitle(title: string): string {
  const value = (title ?? '').trim();
  if (value.length < 2 || value.length > 40) {
    throw tripInvalid('标题请输入 2–40 个字');
  }
  return value;
}

export function assertPlace(place: TripPlaceInput | undefined, label: string): TripPlaceInput {
  const name = (place?.name ?? '').trim();
  if (name.length < 2 || name.length > 64) {
    throw tripInvalid(`${label}请输入 2–64 个字`);
  }
  return {
    name,
    lng: toCoord(place?.lng),
    lat: toCoord(place?.lat),
  };
}

export function assertWaypoints(waypoints: TripPlaceInput[] | undefined): TripPlaceInput[] {
  const list = Array.isArray(waypoints) ? waypoints : [];
  if (list.length > 5) {
    throw tripInvalid('途经点最多 5 个');
  }
  return list.map((item, index) => assertPlace(item, `途经点${index + 1}`));
}

export function assertDepartAt(value: string, allowPast = false): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw tripInvalid('请选择出发时间');
  }
  if (!allowPast && parsed.getTime() < Date.now() - 5 * 60 * 1000) {
    throw tripInvalid('出发时间不能早于现在');
  }
  return parsed;
}

export function assertMaxVehicles(value: number): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw tripInvalid('车队人数上限为 1–20 辆');
  }
  return count;
}

export function assertEstimatedDays(value: number | undefined): number {
  const days = value === undefined ? 1 : Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw tripInvalid('预计天数请填 1–30');
  }
  return days;
}

export function assertDailyMileage(value: number | null | undefined): number | null {
  if (value === undefined || value === null || value === ('' as unknown)) {
    return null;
  }
  const mileage = Number(value);
  if (!Number.isInteger(mileage) || mileage < 1 || mileage > 2000) {
    throw tripInvalid('每日里程请填 1–2000 公里');
  }
  return mileage;
}

export function assertDepth(value: CompanionDepthValue | undefined): CompanionDepthValue {
  if (!value) {
    return CompanionDepth.MEDIUM;
  }
  const allowed: CompanionDepthValue[] = [
    CompanionDepth.SHALLOW,
    CompanionDepth.MEDIUM,
    CompanionDepth.DEEP,
  ];
  if (!allowed.includes(value)) {
    throw tripInvalid('同路深度不正确');
  }
  return value;
}

export function assertAlongPlans(value: AlongPlanValue[] | undefined): AlongPlanValue[] {
  const list = Array.isArray(value) ? value : [];
  const allowed: AlongPlanValue[] = [
    AlongPlan.AA,
    AlongPlan.DINING,
    AlongPlan.SIGHTSEEING,
    AlongPlan.HELP,
  ];
  const unique = [...new Set(list)];
  if (unique.some((item) => !allowed.includes(item))) {
    throw tripInvalid('沿途打算不正确');
  }
  return unique;
}

export function assertPrivacy(value: TripPrivacyValue | undefined): TripPrivacyValue {
  if (!value) {
    return TripPrivacy.PUBLIC;
  }
  const allowed: TripPrivacyValue[] = [TripPrivacy.PUBLIC, TripPrivacy.INVITE];
  if (!allowed.includes(value)) {
    throw tripInvalid('隐私设置不正确');
  }
  return value;
}

export function assertTags(value: string[] | undefined): string[] {
  const list = (Array.isArray(value) ? value : [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.length > 5) {
    throw tripInvalid('标签最多 5 个');
  }
  if (list.some((item) => item.length > 12)) {
    throw tripInvalid('单个标签不超过 12 个字');
  }
  return list;
}

export function assertFeeNote(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) {
    return null;
  }
  if (text.length > 120) {
    throw tripInvalid('费用说明不超过 120 字');
  }
  return text;
}

export function assertAnnouncement(value: string | undefined | null): string | null {
  const text = (value ?? '').trim();
  if (!text) {
    return null;
  }
  if (text.length > 200) {
    throw tripInvalid('公告不超过 200 字');
  }
  return text;
}

export function assertApplyMessage(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) {
    return null;
  }
  if (text.length > 120) {
    throw tripInvalid('申请说明不超过 120 字');
  }
  return text;
}

export function normalizeCreate(
  dto: CreateTripDto,
  options: { allowPastDepartAt?: boolean } = {},
) {
  return {
    title: assertTitle(dto.title),
    origin: assertPlace(dto.origin, '起点'),
    destination: assertPlace(dto.destination, '终点'),
    waypoints: assertWaypoints(dto.waypoints),
    departAt: assertDepartAt(dto.departAt, options.allowPastDepartAt),
    estimatedDays: assertEstimatedDays(dto.estimatedDays),
    dailyMileage: assertDailyMileage(dto.dailyMileage),
    companionDepth: assertDepth(dto.companionDepth),
    alongPlans: assertAlongPlans(dto.alongPlans),
    maxVehicles: assertMaxVehicles(dto.maxVehicles),
    privacy: assertPrivacy(dto.privacy),
    allowCopy: dto.allowCopy !== false,
    feeNote: assertFeeNote(dto.feeNote),
    tags: assertTags(dto.tags),
    announcement: assertAnnouncement(dto.announcement),
  };
}

export function mergeUpdate(dto: UpdateTripDto, current: ReturnType<typeof normalizeCreate>) {
  return normalizeCreate(
    {
      title: dto.title ?? current.title,
      origin: dto.origin ?? current.origin,
      destination: dto.destination ?? current.destination,
      waypoints: dto.waypoints ?? current.waypoints,
      departAt: dto.departAt ?? current.departAt.toISOString(),
      estimatedDays: dto.estimatedDays ?? current.estimatedDays,
      dailyMileage: dto.dailyMileage === undefined ? current.dailyMileage : dto.dailyMileage,
      companionDepth: dto.companionDepth ?? current.companionDepth,
      alongPlans: dto.alongPlans ?? current.alongPlans,
      maxVehicles: dto.maxVehicles ?? current.maxVehicles,
      privacy: dto.privacy ?? current.privacy,
      allowCopy: dto.allowCopy ?? current.allowCopy,
      feeNote: dto.feeNote === undefined ? current.feeNote ?? undefined : dto.feeNote,
      tags: dto.tags ?? current.tags,
      announcement:
        dto.announcement === undefined ? current.announcement ?? undefined : dto.announcement,
    },
    { allowPastDepartAt: dto.departAt === undefined },
  );
}

export function csv(values: string[]): string | null {
  return values.length ? values.join(',') : null;
}

export function splitCsv<T extends string>(value: string | null): T[] {
  if (!value) {
    return [];
  }
  return value.split(',').filter(Boolean) as T[];
}

export function toMysqlDateTime(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function toCoord(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || Math.abs(num) > 180) {
    return null;
  }
  return Number(num.toFixed(6));
}

export function haversineKm(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Number((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

export function isOpenStatus(status: TripStatusValue): boolean {
  return status === TripStatus.RECRUITING || status === TripStatus.ONGOING;
}

export function canReapply(status: MemberStatusValue | undefined): boolean {
  return !status || status === MemberStatus.REJECTED || status === MemberStatus.LEFT;
}

export function asNodeKind(kind: string): TripNodeKindValue {
  if (kind === TripNodeKind.ORIGIN || kind === TripNodeKind.DEST || kind === TripNodeKind.WAYPOINT) {
    return kind;
  }
  return TripNodeKind.WAYPOINT;
}
