import type { ChatMessage, WsServerMessage } from "@walk-together/shared-types";
import { refreshUnreadBadge } from "../api/im";
import { getWsUrl } from "../api/location";
import { connectLocationSocket, type LocationSocket } from "../native/location-socket";
import { getProfile, getToken, isLoggedIn } from "./session";

type ChatHandler = (tripId: number, message: ChatMessage) => void;
type ReadHandler = (tripId: number, userId: number, lastMessageId: number) => void;
type TripHandler = (tripId: number) => void;

let socket: LocationSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let activeChatTripId = 0;
const chatHandlers = new Set<ChatHandler>();
const readHandlers = new Set<ReadHandler>();
const tripHandlers = new Set<TripHandler>();

export function setActiveChatTripId(tripId: number): void {
  activeChatTripId = tripId;
}

export function startChatInbox(): void {
  if (!isLoggedIn()) {
    return;
  }
  started = true;
  if (socket) {
    return;
  }
  connect();
}

export function stopChatInbox(): void {
  started = false;
  activeChatTripId = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopPing();
  socket?.close();
  socket = null;
}

export function onInboxChat(handler: ChatHandler): () => void {
  chatHandlers.add(handler);
  return () => {
    chatHandlers.delete(handler);
  };
}

export function onInboxRead(handler: ReadHandler): () => void {
  readHandlers.add(handler);
  return () => {
    readHandlers.delete(handler);
  };
}

export function onInboxTrip(handler: TripHandler): () => void {
  tripHandlers.add(handler);
  return () => {
    tripHandlers.delete(handler);
  };
}

function connect(): void {
  const token = getToken();
  if (!token || socket) {
    return;
  }
  socket = connectLocationSocket(getWsUrl(token), {
    onOpen() {
      startPing();
    },
    onClose() {
      socket = null;
      stopPing();
      scheduleReconnect();
    },
    onError() {
      socket = null;
      stopPing();
      scheduleReconnect();
    },
    onMessage: onSocketMessage,
  });
}

function scheduleReconnect(): void {
  if (!started || reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (started && isLoggedIn()) {
      connect();
    }
  }, 2000);
}

function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => {
    socket?.send({ type: "ping" });
  }, 25000);
}

function stopPing(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function onSocketMessage(message: WsServerMessage): void {
  if (message.type === "chat") {
    const me = getProfile()?.id;
    if (message.tripId !== activeChatTripId && message.message.senderId !== me) {
      void refreshUnreadBadge();
    }
    for (const handler of chatHandlers) {
      handler(message.tripId, message.message);
    }
    return;
  }
  if (message.type === "chat.read") {
    for (const handler of readHandlers) {
      handler(message.tripId, message.userId, message.lastMessageId);
    }
    return;
  }
  if (message.type === "trip") {
    for (const handler of tripHandlers) {
      handler(message.tripId);
    }
  }
}
