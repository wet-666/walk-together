import { Injectable } from '@nestjs/common';
import type { LocationPoint } from '@walk-together/shared-types';

type LocationListener = (tripId: number, point: LocationPoint) => void;

@Injectable()
export class LocationHub {
  private readonly listeners = new Set<LocationListener>();

  onPoint(listener: LocationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(tripId: number, point: LocationPoint): void {
    for (const listener of this.listeners) {
      listener(tripId, point);
    }
  }
}
