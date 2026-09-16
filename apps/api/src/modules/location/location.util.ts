import { ErrorCode, type ReportLocationDto } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';

export function locationInvalid(message: string): BusinessException {
  return new BusinessException(ErrorCode.LOCATION_INVALID, message);
}

export function parseReport(dto: ReportLocationDto): {
  lng: number;
  lat: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
} {
  const lng = parseCoord(dto?.lng, 180, '经度');
  const lat = parseCoord(dto?.lat, 90, '纬度');
  return {
    lng,
    lat,
    speed: parseOptional(dto?.speed, 0, 80),
    heading: parseOptional(dto?.heading, 0, 360),
    accuracy: parseOptional(dto?.accuracy, 0, 20000),
  };
}

export function parseCoord(value: number | string | undefined, maxAbs: number, label: string): number {
  const num = Number(value);
  if (!Number.isFinite(num) || Math.abs(num) > maxAbs) {
    throw locationInvalid(`${label}不正确`);
  }
  return Number(num.toFixed(6));
}

function parseOptional(
  value: number | string | null | undefined,
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    return null;
  }
  return Number(num.toFixed(1));
}

export function tripLocationKey(tripId: number): string {
  return `loc:trip:${tripId}`;
}

export function tripRouteKey(tripId: number): string {
  return `route:trip:${tripId}`;
}

export function samplePoints<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) {
    return points;
  }
  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

export function staticMapZoom(points: Array<{ lng: number; lat: number }>): number {
  if (points.length < 2) {
    return 11;
  }
  const lngs = points.map((item) => item.lng);
  const lats = points.map((item) => item.lat);
  const span = Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats));
  if (span > 4) {
    return 6;
  }
  if (span > 2) {
    return 7;
  }
  if (span > 1) {
    return 8;
  }
  if (span > 0.4) {
    return 9;
  }
  if (span > 0.2) {
    return 10;
  }
  if (span > 0.08) {
    return 11;
  }
  return 12;
}

export function buildStaticMapQuery(input: {
  route: Array<{ lng: number; lat: number }>;
  markers: Array<{ lng: number; lat: number; label: string; color: string }>;
}): string | null {
  const route = samplePoints(input.route, 18);
  const markers = input.markers.filter(
    (item) => Number.isFinite(item.lng) && Number.isFinite(item.lat),
  );
  const focus = route[0] ?? markers[0];
  if (!focus) {
    return null;
  }
  const parts = [
    `location=${focus.lng},${focus.lat}`,
    `zoom=${staticMapZoom(route.length ? route : markers)}`,
    'size=750*500',
    'scale=1',
  ];
  if (route.length >= 2) {
    const path = route.map((item) => `${item.lng},${item.lat}`).join(';');
    parts.push(`paths=6,0x1D4F91,1,,:${path}`);
    const mid = route[Math.floor(route.length / 2)];
    parts[0] = `location=${mid.lng},${mid.lat}`;
  }
  return parts.join('&');
}
