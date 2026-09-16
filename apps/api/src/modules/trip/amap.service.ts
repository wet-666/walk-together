import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toCoord } from './trip.util';

export type GeoPoint = { lng: number; lat: number };

@Injectable()
export class AmapService {
  private readonly logger = new Logger(AmapService.name);

  constructor(private readonly config: ConfigService) {}

  async geocode(address: string): Promise<GeoPoint | null> {
    const key = this.config.get<string>('AMAP_WEB_KEY', '').trim();
    if (!key || !address.trim()) {
      return null;
    }

    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address.trim())}&key=${encodeURIComponent(key)}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as {
        status?: string;
        geocodes?: Array<{ location?: string }>;
      };
      if (body.status !== '1' || !body.geocodes?.[0]?.location) {
        return null;
      }
      const [lngRaw, latRaw] = body.geocodes[0].location.split(',');
      const lng = toCoord(lngRaw);
      const lat = toCoord(latRaw);
      if (lng === null || lat === null) {
        return null;
      }
      return { lng, lat };
    } catch (error) {
      this.logger.warn(
        `amap geocode failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async fillPlace(place: { name: string; lng?: number | null; lat?: number | null }) {
    if (place.lng != null && place.lat != null) {
      return place;
    }
    const point = await this.geocode(place.name);
    if (!point) {
      return place;
    }
    return { ...place, lng: point.lng, lat: point.lat };
  }

  async drivePolyline(points: GeoPoint[]): Promise<GeoPoint[]> {
    const key = this.config.get<string>('AMAP_WEB_KEY', '').trim();
    if (!key || points.length < 2) {
      return points;
    }
    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1);
    const search = new URLSearchParams({
      origin: `${origin.lng},${origin.lat}`,
      destination: `${destination.lng},${destination.lat}`,
      key,
      extensions: 'base',
      strategy: '0',
    });
    if (waypoints.length) {
      search.set(
        'waypoints',
        waypoints.map((item) => `${item.lng},${item.lat}`).join(';'),
      );
    }
    try {
      const response = await fetch(`https://restapi.amap.com/v3/direction/driving?${search}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return points;
      }
      const body = (await response.json()) as {
        status?: string;
        route?: { paths?: Array<{ steps?: Array<{ polyline?: string }> }> };
      };
      if (body.status !== '1') {
        return points;
      }
      const polyline = (body.route?.paths?.[0]?.steps ?? [])
        .flatMap((step) => parsePolyline(step.polyline))
        .filter((item): item is GeoPoint => item !== null);
      return polyline.length >= 2 ? simplifyPolyline(polyline) : points;
    } catch (error) {
      this.logger.warn(
        `amap driving failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return points;
    }
  }

  async staticMapPng(query: string): Promise<Buffer | null> {
    const key = this.config.get<string>('AMAP_WEB_KEY', '').trim();
    if (!key || !query.trim()) {
      return null;
    }
    const search = query.includes('key=') ? query : `${query}&key=${encodeURIComponent(key)}`;
    try {
      const response = await fetch(`https://restapi.amap.com/v3/staticmap?${search}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return null;
      }
      const mime = response.headers.get('content-type') || '';
      if (!mime.includes('image')) {
        const body = await response.text();
        this.logger.warn(`amap static map rejected: ${body.slice(0, 180)}`);
        return null;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(
        `amap static map failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

function parsePolyline(raw: string | undefined): Array<GeoPoint | null> {
  if (!raw) {
    return [];
  }
  return raw.split(';').map((pair) => {
    const [lngRaw, latRaw] = pair.split(',');
    const lng = toCoord(lngRaw);
    const lat = toCoord(latRaw);
    if (lng === null || lat === null) {
      return null;
    }
    return { lng, lat };
  });
}

function simplifyPolyline(points: GeoPoint[], maxPoints = 200): GeoPoint[] {
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
