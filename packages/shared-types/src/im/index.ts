import type { TripStatusValue } from '../trip';

export const ChatMessageType = {
  TEXT: 'text',
  IMAGE: 'image',
  SYSTEM: 'system',
} as const;

export type ChatMessageTypeValue = (typeof ChatMessageType)[keyof typeof ChatMessageType];

export const CHAT_POLL_INTERVAL_MS = 30000;
export const CHAT_TEXT_MAX_LENGTH = 2000;
export const CHAT_HISTORY_LIMIT = 30;

export interface SendChatTextDto {
  content: string;
}

export interface ChatReadCursor {
  userId: number;
  lastReadId: number;
}

export interface ChatMessage {
  id: number;
  tripId: number;
  senderId: number | null;
  senderNickname: string;
  senderAvatarUrl: string | null;
  type: ChatMessageTypeValue;
  content: string;
  createdAt: string;
  mine: boolean;
  readCount: number;
}

export interface ChatConversation {
  tripId: number;
  title: string;
  tripStatus: TripStatusValue;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  memberCount: number;
  updatedAt: string;
  readCursors: ChatReadCursor[];
}

export interface ImCredentials {
  enabled: boolean;
  sdkAppId: number | null;
  userId: string | null;
  userSig: string | null;
  expireAt: string | null;
}

export interface WsChatEvent {
  type: 'chat';
  tripId: number;
  message: ChatMessage;
}

export interface WsChatReadEvent {
  type: 'chat.read';
  tripId: number;
  userId: number;
  lastMessageId: number;
}
