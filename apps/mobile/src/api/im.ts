import type {
  ChatConversation,
  ChatMessage,
  ImCredentials,
  SendChatTextDto,
} from "@walk-together/shared-types";
import { request, upload } from "./http";

export function getImCredentials() {
  return request<ImCredentials>("/im/credentials", { toast: false });
}

export function getUnreadTotal() {
  return request<number>("/im/unread", { toast: false });
}

export function listConversations() {
  return request<ChatConversation[]>("/im/conversations", { toast: false });
}

export function getConversation(tripId: number) {
  return request<ChatConversation>(`/im/trips/${tripId}`, { toast: false });
}

export function listMessages(tripId: number, beforeId?: number) {
  const query = beforeId ? `?beforeId=${beforeId}` : "";
  return request<ChatMessage[]>(`/im/trips/${tripId}/messages${query}`, {
    toast: false,
  });
}

export function sendChatText(tripId: number, dto: SendChatTextDto) {
  return request<ChatMessage>(`/im/trips/${tripId}/messages`, {
    method: "POST",
    data: dto,
    toast: true,
  });
}

export function sendChatImage(tripId: number, filePath: string) {
  return upload<ChatMessage>(`/im/trips/${tripId}/images`, filePath);
}

export function markChatRead(tripId: number, lastMessageId?: number) {
  return request<null>(`/im/trips/${tripId}/read`, {
    method: "POST",
    data: { lastMessageId },
    toast: false,
  });
}

export function applyUnreadBadge(count: number): void {
  if (count > 0) {
    const text = count > 99 ? "99+" : String(count);
    uni.setTabBarBadge({
      index: 1,
      text,
      fail: () => {
        uni.showTabBarRedDot({
          index: 1,
          fail: () => undefined,
        });
      },
    });
    return;
  }
  uni.removeTabBarBadge({
    index: 1,
    fail: () => undefined,
  });
  uni.hideTabBarRedDot({
    index: 1,
    fail: () => undefined,
  });
}

export async function refreshUnreadBadge(): Promise<void> {
  const result = await getUnreadTotal();
  if (result.data == null) {
    applyUnreadBadge(0);
    return;
  }
  applyUnreadBadge(Number(result.data) || 0);
}
