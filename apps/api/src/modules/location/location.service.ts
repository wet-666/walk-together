import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  LOCATION_ONLINE_MS,
  LOCATION_POLL_INTERVAL_MS,
  LOCATION_REPORT_INTERVAL_MS,
  LOCATION_STALE_MS,
  type GeoLngLat,
  type LocationPoint,
  type ReportLocationDto,
  type TripMapSnapshot,
} from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';
import { RedisService } from '../../common/redis/redis.service';
import { AmapService, type GeoPoint } from '../trip/amap.service';
import { TripService } from '../trip/trip.service';
import { LocationHub } from './location.hub';
import { buildStaticMapQuery, parseReport, tripLocationKey, tripRouteKey } from './location.util';

const LOCATION_TTL_SECONDS = 600;
const ROUTE_TTL_SECONDS = 1800;

@Injectable()
export class LocationService {
  constructor(
    private readonly trips: TripService,
    private readonly redis: RedisService,
    private readonly amap: AmapService,
    private readonly hub: LocationHub,
  ) {}

  async snapshot(userId: number, tripId?: number): Promise<TripMapSnapshot | null> {
    const context = await this.trips.getLiveMapContext(userId, tripId);
    if (!context) {
      return null;
    }
    const [members, polyline] = await Promise.all([
      this.listPoints(context.tripId, context.members),
      this.routePolyline(context.tripId, context.nodes),
    ]);
    return {
      tripId: context.tripId,
      title: context.title,
      status: context.status,
      originName: context.originName,
      destName: context.destName,
      nodes: context.nodes,
      polyline,
      roster: context.members.map((item) => ({
        userId: item.userId,
        nickname: item.nickname,
        avatarUrl: item.avatarUrl,
        role: item.role,
      })),
      members,
      reportIntervalMs: LOCATION_REPORT_INTERVAL_MS,
      pollIntervalMs: LOCATION_POLL_INTERVAL_MS,
    };
  }

  async report(userId: number, tripId: number, dto: ReportLocationDto): Promise<LocationPoint> {
    const parsed = parseReport(dto);
    const context = await this.trips.getLiveMapContext(userId, tripId);
    const member = context?.members.find((item) => item.userId === userId);
    if (!context || !member) {
      throw new BusinessException(ErrorCode.TRIP_FORBIDDEN, '加入车队后才能上报位置');
    }
    const point: LocationPoint = {
      userId,
      nickname: member.nickname,
      avatarUrl: member.avatarUrl,
      role: member.role,
      lng: parsed.lng,
      lat: parsed.lat,
      speed: parsed.speed,
      heading: parsed.heading,
      accuracy: parsed.accuracy,
      reportedAt: new Date().toISOString(),
      online: true,
    };
    const key = tripLocationKey(tripId);
    await this.redis.hset(key, String(userId), JSON.stringify(point));
    await this.redis.expire(key, LOCATION_TTL_SECONDS);
    this.hub.emit(tripId, point);
    return point;
  }

  async listPoints(
    tripId: number,
    members: Array<{
      userId: number;
      nickname: string;
      avatarUrl: string | null;
      role: LocationPoint['role'];
    }>,
  ): Promise<LocationPoint[]> {
    const raw = await this.redis.hgetall(tripLocationKey(tripId));
    const now = Date.now();
    const points: LocationPoint[] = [];
    for (const member of members) {
      const saved = this.readPoint(raw[String(member.userId)]);
      if (!saved) {
        continue;
      }
      const age = now - Date.parse(saved.reportedAt);
      if (!Number.isFinite(age) || age > LOCATION_STALE_MS) {
        continue;
      }
      points.push({
        ...saved,
        nickname: member.nickname,
        avatarUrl: member.avatarUrl,
        role: member.role,
        online: age <= LOCATION_ONLINE_MS,
      });
    }
    return points;
  }

  private async routePolyline(
    tripId: number,
    nodes: Array<{ name: string; lng: number | null; lat: number | null }>,
  ): Promise<GeoLngLat[]> {
    const cached = await this.redis.get(tripRouteKey(tripId));
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as GeoLngLat[];
        if (Array.isArray(parsed) && parsed.length) {
          return parsed;
        }
      } catch {
        // ignore broken cache
      }
    }

    const filled: GeoPoint[] = [];
    for (const node of nodes) {
      if (node.lng != null && node.lat != null) {
        filled.push({ lng: node.lng, lat: node.lat });
        continue;
      }
      const point = await this.amap.geocode(node.name);
      if (point) {
        filled.push(point);
      }
    }
    const polyline = await this.amap.drivePolyline(filled);
    if (polyline.length) {
      await this.redis.setEx(tripRouteKey(tripId), ROUTE_TTL_SECONDS, JSON.stringify(polyline));
    }
    return polyline;
  }

  async basemapPng(userId: number, tripId: number): Promise<Buffer | null> {
    const snapshot = await this.snapshot(userId, tripId);
    if (!snapshot) {
      return null;
    }
    const cacheKey = `${tripRouteKey(tripId)}:png`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return Buffer.from(cached, 'base64');
      } catch {
        // ignore broken cache
      }
    }
    const route = snapshot.polyline.length
      ? snapshot.polyline
      : snapshot.nodes.filter((item) => item.lng != null && item.lat != null).map((item) => ({
          lng: item.lng as number,
          lat: item.lat as number,
        }));
    const query = buildStaticMapQuery({
      route,
      markers: snapshot.members.map((item, index) => ({
        lng: item.lng,
        lat: item.lat,
        label: item.userId === userId ? 'ME' : String.fromCharCode(65 + Math.min(index, 24)),
        color: item.userId === userId ? '0x2563EB' : item.role === 'captain' ? '0xD97706' : '0x1D4F91',
      })),
    });
    if (!query) {
      return null;
    }
    const png = await this.amap.staticMapPng(query);
    if (png) {
      await this.redis.setEx(cacheKey, ROUTE_TTL_SECONDS, png.toString('base64'));
    }
    return png;
  }

  private readPoint(raw: string | undefined): LocationPoint | null {
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as LocationPoint;
      if (!parsed?.userId || !Number.isFinite(parsed.lng) || !Number.isFinite(parsed.lat)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
