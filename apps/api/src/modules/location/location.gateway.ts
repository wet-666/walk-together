import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ErrorCode, type ChatMessage, type WsClientMessage, type WsServerMessage } from '@walk-together/shared-types';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { TokenService } from '../../common/auth/token.service';
import { ImHub } from '../im/im.hub';
import { ImService } from '../im/im.service';
import { TripEventHub, type TripLifecycleEvent } from '../trip/trip-event.hub';
import { LocationHub } from './location.hub';
import { LocationService } from './location.service';

type SocketState = {
  userId: number;
  tripId: number | null;
  chatTripId: number | null;
};

@Injectable()
export class LocationGateway implements OnModuleDestroy {
  private readonly logger = new Logger(LocationGateway.name);
  private wss: WebSocketServer | null = null;
  private readonly states = new WeakMap<WebSocket, SocketState>();
  private readonly rooms = new Map<number, Set<WebSocket>>();
  private readonly chatRooms = new Map<number, Set<WebSocket>>();
  private readonly userSockets = new Map<number, Set<WebSocket>>();
  private unsubscribeHub: (() => void) | null = null;
  private unsubscribeChat: (() => void) | null = null;
  private unsubscribeRead: (() => void) | null = null;
  private unsubscribeTrip: (() => void) | null = null;

  constructor(
    private readonly tokens: TokenService,
    private readonly locations: LocationService,
    private readonly hub: LocationHub,
    private readonly im: ImService,
    private readonly chatHub: ImHub,
    private readonly trips: TripEventHub,
  ) {}

  attach(server: { on: (event: 'upgrade', listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void) => void }): void {
    if (this.wss) {
      return;
    }
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      if (!this.isLocationPath(request.url)) {
        return;
      }
      void this.handleUpgrade(request, socket, head);
    });
    this.wss.on('connection', (socket, request) => {
      void this.onConnection(socket, request);
    });
    this.unsubscribeHub = this.hub.onPoint((tripId, point) => {
      this.broadcast(tripId, { type: 'location', tripId, point });
    });
    this.unsubscribeChat = this.chatHub.onMessage((tripId, message) => {
      void this.fanoutChat(tripId, message);
    });
    this.unsubscribeRead = this.chatHub.onRead((tripId, userId, lastMessageId) => {
      void this.fanoutRead(tripId, userId, lastMessageId);
    });
    this.unsubscribeTrip = this.trips.on((event) => {
      this.fanoutTrip(event);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeHub?.();
    this.unsubscribeHub = null;
    this.unsubscribeChat?.();
    this.unsubscribeChat = null;
    this.unsubscribeRead?.();
    this.unsubscribeRead = null;
    this.unsubscribeTrip?.();
    this.unsubscribeTrip = null;
    this.wss?.clients.forEach((client) => client.close());
    this.wss?.close();
    this.wss = null;
  }

  private async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    try {
      const userId = await this.authenticate(request);
      this.wss?.handleUpgrade(request, socket, head, (ws) => {
        this.states.set(ws, { userId, tripId: null, chatTripId: null });
        this.trackUser(userId, ws);
        this.wss?.emit('connection', ws, request);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
    }
  }

  private async onConnection(socket: WebSocket, _request: IncomingMessage): Promise<void> {
    this.send(socket, { type: 'ready' });
    socket.on('message', (raw) => {
      void this.onMessage(socket, raw.toString());
    });
    socket.on('close', () => {
      this.leave(socket);
      this.leaveChat(socket);
      this.untrackUser(socket);
    });
    socket.on('error', (error) => {
      this.logger.warn(error.message);
      this.leave(socket);
      this.leaveChat(socket);
      this.untrackUser(socket);
    });
  }

  private async onMessage(socket: WebSocket, raw: string): Promise<void> {
    const state = this.states.get(socket);
    if (!state) {
      socket.close();
      return;
    }
    const message = this.parseMessage(raw);
    if (!message) {
      this.send(socket, { type: 'error', code: ErrorCode.LOCATION_INVALID, message: '消息格式不正确' });
      return;
    }
    if (message.type === 'ping') {
      this.send(socket, { type: 'pong' });
      return;
    }
    if (message.type === 'unsubscribe') {
      this.leave(socket);
      state.tripId = null;
      return;
    }
    if (message.type === 'chat.unsubscribe') {
      this.leaveChat(socket);
      state.chatTripId = null;
      return;
    }
    if (message.type === 'chat.subscribe') {
      try {
        await this.im.assertCanChat(state.userId, message.tripId);
        this.leaveChat(socket);
        state.chatTripId = message.tripId;
        this.joinChat(message.tripId, socket);
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'errorCode' in error
            ? Number((error as { errorCode: number }).errorCode)
            : ErrorCode.FAILED;
        const text = error instanceof Error ? error.message : '订阅群聊失败';
        this.send(socket, { type: 'error', code, message: text });
      }
      return;
    }
    try {
      const snapshot = await this.locations.snapshot(state.userId, message.tripId);
      if (!snapshot) {
        this.send(socket, { type: 'error', code: ErrorCode.TRIP_NOT_FOUND, message: '还没有可同步的行程' });
        return;
      }
      this.leave(socket);
      state.tripId = snapshot.tripId;
      this.join(snapshot.tripId, socket);
      this.send(socket, { type: 'snapshot', data: snapshot });
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'errorCode' in error
          ? Number((error as { errorCode: number }).errorCode)
          : ErrorCode.FAILED;
      const text =
        error instanceof Error ? error.message : '订阅失败';
      this.send(socket, { type: 'error', code, message: text });
    }
  }

  private join(tripId: number, socket: WebSocket): void {
    const room = this.rooms.get(tripId) ?? new Set<WebSocket>();
    room.add(socket);
    this.rooms.set(tripId, room);
  }

  private leave(socket: WebSocket): void {
    const state = this.states.get(socket);
    if (!state?.tripId) {
      return;
    }
    const room = this.rooms.get(state.tripId);
    room?.delete(socket);
    if (room && room.size === 0) {
      this.rooms.delete(state.tripId);
    }
  }

  private joinChat(tripId: number, socket: WebSocket): void {
    const room = this.chatRooms.get(tripId) ?? new Set<WebSocket>();
    room.add(socket);
    this.chatRooms.set(tripId, room);
  }

  private leaveChat(socket: WebSocket): void {
    const state = this.states.get(socket);
    if (!state?.chatTripId) {
      return;
    }
    const room = this.chatRooms.get(state.chatTripId);
    room?.delete(socket);
    if (room && room.size === 0) {
      this.chatRooms.delete(state.chatTripId);
    }
  }

  private trackUser(userId: number, socket: WebSocket): void {
    const room = this.userSockets.get(userId) ?? new Set<WebSocket>();
    room.add(socket);
    this.userSockets.set(userId, room);
  }

  private untrackUser(socket: WebSocket): void {
    const userId = this.states.get(socket)?.userId;
    if (!userId) {
      return;
    }
    const room = this.userSockets.get(userId);
    room?.delete(socket);
    if (room && room.size === 0) {
      this.userSockets.delete(userId);
    }
  }

  private async fanoutChat(tripId: number, message: ChatMessage): Promise<void> {
    const memberIds = await this.im.listLiveMemberIds(tripId);
    const sent = new Set<WebSocket>();
    const deliver = (socket: WebSocket, userId: number | undefined) => {
      if (!userId || sent.has(socket)) {
        return;
      }
      sent.add(socket);
      this.send(socket, {
        type: 'chat',
        tripId,
        message: { ...message, mine: message.senderId === userId },
      });
    };
    for (const socket of this.chatRooms.get(tripId) ?? []) {
      deliver(socket, this.states.get(socket)?.userId);
    }
    for (const userId of memberIds) {
      for (const socket of this.userSockets.get(userId) ?? []) {
        deliver(socket, userId);
      }
    }
  }

  private async fanoutRead(tripId: number, userId: number, lastMessageId: number): Promise<void> {
    const memberIds = await this.im.listLiveMemberIds(tripId);
    const sent = new Set<WebSocket>();
    const payload = { type: 'chat.read' as const, tripId, userId, lastMessageId };
    const deliver = (socket: WebSocket) => {
      if (sent.has(socket)) {
        return;
      }
      sent.add(socket);
      this.send(socket, payload);
    };
    for (const socket of this.chatRooms.get(tripId) ?? []) {
      deliver(socket);
    }
    for (const memberId of memberIds) {
      for (const socket of this.userSockets.get(memberId) ?? []) {
        deliver(socket);
      }
    }
  }

  private fanoutTrip(event: TripLifecycleEvent): void {
    const userIds =
      event.type === 'updated'
        ? event.userIds
        : event.type === 'joined' || event.type === 'left'
          ? [event.userId]
          : [];
    if (!userIds.length) {
      return;
    }
    const payload: WsServerMessage = { type: 'trip', tripId: event.tripId };
    const sent = new Set<WebSocket>();
    for (const userId of userIds) {
      for (const socket of this.userSockets.get(userId) ?? []) {
        if (sent.has(socket)) {
          continue;
        }
        sent.add(socket);
        this.send(socket, payload);
      }
    }
  }

  private broadcast(tripId: number, message: WsServerMessage): void {
    const payload = JSON.stringify(message);
    const room = this.rooms.get(tripId);
    if (!room) {
      return;
    }
    for (const socket of room) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  private send(socket: WebSocket, message: WsServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private parseMessage(raw: string): WsClientMessage | null {
    try {
      const parsed = JSON.parse(raw) as WsClientMessage;
      if (parsed?.type === 'ping' || parsed?.type === 'unsubscribe' || parsed?.type === 'chat.unsubscribe') {
        return parsed;
      }
      if (
        (parsed?.type === 'subscribe' || parsed?.type === 'chat.subscribe') &&
        Number.isInteger(Number(parsed.tripId))
      ) {
        return { type: parsed.type, tripId: Number(parsed.tripId) };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async authenticate(request: IncomingMessage): Promise<number> {
    const token = this.readToken(request);
    if (!token) {
      throw new Error('missing token');
    }
    const payload = this.tokens.verify(token);
    if (await this.tokens.isRevoked(payload.jti) || await this.tokens.isUserBlocked(payload.userId)) {
      throw new Error('blocked');
    }
    return payload.userId;
  }

  private readToken(request: IncomingMessage): string | null {
    const header = request.headers.authorization;
    if (typeof header === 'string') {
      const match = /^Bearer\s+(.+)$/i.exec(header.trim());
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url || '/', `http://${host}`);
    const queryToken = url.searchParams.get('token');
    return queryToken?.trim() || null;
  }

  private isLocationPath(url: string | undefined): boolean {
    if (!url) {
      return false;
    }
    const path = url.split('?')[0];
    return path === '/api/v1/ws' || path === '/ws';
  }
}
