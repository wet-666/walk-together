import type { WsChatEvent, WsChatReadEvent } from '../im';
import type { MemberRoleValue, TripNode, TripStatusValue } from '../trip';

export const LOCATION_REPORT_INTERVAL_MS = 5000;
export const LOCATION_POLL_INTERVAL_MS = 30000;
export const LOCATION_STALE_MS = 120000;
export const LOCATION_ONLINE_MS = 20000;

export interface GeoLngLat {
  lng: number;
  lat: number;
}

export interface ReportLocationDto {
  lng: number;
  lat: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
}

export interface LocationPoint {
  userId: number;
  nickname: string;
  avatarUrl: string | null;
  role: MemberRoleValue;
  lng: number;
  lat: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  reportedAt: string;
  online: boolean;
}

export interface TripMapMember {
  userId: number;
  nickname: string;
  avatarUrl: string | null;
  role: MemberRoleValue;
}

export interface TripMapSnapshot {
  tripId: number;
  title: string;
  status: TripStatusValue;
  originName: string;
  destName: string;
  nodes: TripNode[];
  polyline: GeoLngLat[];
  roster: TripMapMember[];
  members: LocationPoint[];
  reportIntervalMs: number;
  pollIntervalMs: number;
}

export interface WsLocationEvent {
  type: 'location';
  tripId: number;
  point: LocationPoint;
}

export type WsClientMessage =
  | { type: 'subscribe'; tripId: number }
  | { type: 'unsubscribe' }
  | { type: 'chat.subscribe'; tripId: number }
  | { type: 'chat.unsubscribe' }
  | { type: 'ping' };

export type WsServerMessage =
  | { type: 'ready' }
  | { type: 'pong' }
  | { type: 'snapshot'; data: TripMapSnapshot }
  | WsLocationEvent
  | WsChatEvent
  | WsChatReadEvent
  | { type: 'error'; code: number; message: string };
