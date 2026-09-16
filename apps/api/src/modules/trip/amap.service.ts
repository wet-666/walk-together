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
}
