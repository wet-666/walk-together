import { Injectable } from '@nestjs/common';

export type TripLifecycleEvent =
  | { type: 'created'; tripId: number; userId: number; title: string }
  | { type: 'joined'; tripId: number; userId: number }
  | { type: 'left'; tripId: number; userId: number; reason: 'left' | 'removed' }
  | { type: 'ended'; tripId: number }
  | { type: 'updated'; tripId: number; userIds: number[] };

type TripEventListener = (event: TripLifecycleEvent) => void;

@Injectable()
export class TripEventHub {
  private readonly listeners = new Set<TripEventListener>();

  on(listener: TripEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: TripLifecycleEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
