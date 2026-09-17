import { Injectable } from '@nestjs/common';
import type { ChatMessage } from '@walk-together/shared-types';

type ChatListener = (tripId: number, message: ChatMessage) => void;
type ChatReadListener = (tripId: number, userId: number, lastMessageId: number) => void;

@Injectable()
export class ImHub {
  private readonly listeners = new Set<ChatListener>();
  private readonly readListeners = new Set<ChatReadListener>();

  onMessage(listener: ChatListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onRead(listener: ChatReadListener): () => void {
    this.readListeners.add(listener);
    return () => {
      this.readListeners.delete(listener);
    };
  }

  emit(tripId: number, message: ChatMessage): void {
    for (const listener of this.listeners) {
      listener(tripId, message);
    }
  }

  emitRead(tripId: number, userId: number, lastMessageId: number): void {
    for (const listener of this.readListeners) {
      listener(tripId, userId, lastMessageId);
    }
  }
}
