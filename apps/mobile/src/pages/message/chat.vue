<template>
  <view class="chat">
    <view v-if="blocked" class="chat__empty">
      <EmptyState
        title="不在这支车队里"
        description="入队后会自动进群。退出或被移除后就不能再看这个群。"
        action-text="回消息列表"
        @action="goBack"
      />
    </view>

    <template v-else>
      <scroll-view
        class="chat__scroller"
        scroll-y
        :scroll-into-view="anchor"
        :scroll-with-animation="true"
        @scrolltoupper="loadOlder"
      >
        <view v-if="loadingOlder" class="chat__more">加载更早的消息…</view>
        <view
          v-for="item in messages"
          :id="'m-' + item.id"
          :key="item.id"
          class="chat__item"
          :class="itemClass(item)"
        >
          <text v-if="item.type === 'system'" class="chat__system">{{ item.content }}</text>
          <view v-else class="chat__bubble-wrap">
            <text class="chat__name">{{ item.mine ? "我" : item.senderNickname }}</text>
            <image
              v-if="item.type === 'image'"
              class="chat__image"
              mode="widthFix"
              :src="mediaUrl(item.content)"
              @click="preview(item.content)"
            />
            <text v-else class="chat__bubble">{{ item.content }}</text>
            <view class="chat__meta">
              <text class="chat__time">{{ formatChatTime(item.createdAt) }}</text>
              <text v-if="receiptText(item)" class="chat__read">{{ receiptText(item) }}</text>
            </view>
          </view>
        </view>
        <view id="chat-end" />
      </scroll-view>

      <view class="chat__bar">
        <wd-button size="small" plain @click="pickImage">图片</wd-button>
        <input
          v-model="draft"
          class="chat__input"
          confirm-type="send"
          placeholder="发一条给车队"
          @confirm="onSend"
        />
        <wd-button size="small" type="primary" :disabled="sending" @click="onSend">发送</wd-button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import {
  CHAT_POLL_INTERVAL_MS,
  ErrorCode,
  type ChatMessage,
  type WsServerMessage,
} from "@walk-together/shared-types";
import { nextTick, ref } from "vue";
import {
  getConversation,
  listMessages,
  markChatRead,
  sendChatImage,
  sendChatText,
} from "../../api/im";
import { getWsUrl } from "../../api/location";
import EmptyState from "../../components/EmptyState.vue";
import { resolveMediaUrl } from "../../config/env";
import { connectLocationSocket, type LocationSocket } from "../../native/location-socket";
import { onInboxChat, onInboxRead, setActiveChatTripId } from "../../store/chat-inbox";
import { getProfile, getToken, isLoggedIn } from "../../store/session";
import { formatChatTime } from "../../utils/datetime";

const tripId = ref(0);
const blocked = ref(false);
const sending = ref(false);
const loadingOlder = ref(false);
const noMore = ref(false);
const draft = ref("");
const messages = ref<ChatMessage[]>([]);
const anchor = ref("chat-end");
const syncOk = ref(false);
const memberCount = ref(0);
const cursors = ref<Record<number, number>>({});

let socket: LocationSocket | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let offInboxChat: (() => void) | null = null;
let offInboxRead: (() => void) | null = null;

onLoad((query) => {
  tripId.value = Number(query?.id || 0);
});

onShow(() => {
  setActiveChatTripId(tripId.value);
  offInboxChat?.();
  offInboxRead?.();
  offInboxChat = onInboxChat((id, message) => {
    if (id === tripId.value) {
      append(message);
    }
  });
  offInboxRead = onInboxRead((id, userId, lastMessageId) => {
    if (id === tripId.value) {
      applyRead(userId, lastMessageId);
    }
  });
  void bootstrap();
});

onHide(() => {
  setActiveChatTripId(0);
  offInboxChat?.();
  offInboxRead?.();
  offInboxChat = null;
  offInboxRead = null;
  stopLive();
});

onUnload(() => {
  setActiveChatTripId(0);
  offInboxChat?.();
  offInboxRead?.();
  offInboxChat = null;
  offInboxRead = null;
  stopLive();
});

async function bootstrap() {
  if (!isLoggedIn() || !tripId.value) {
    blocked.value = true;
    return;
  }
  const conversation = await getConversation(tripId.value);
  if (conversation.code !== ErrorCode.OK || !conversation.data) {
    blocked.value = true;
    return;
  }
  blocked.value = false;
  memberCount.value = conversation.data.memberCount;
  const nextCursors: Record<number, number> = {};
  for (const item of conversation.data.readCursors || []) {
    nextCursors[item.userId] = item.lastReadId;
  }
  cursors.value = nextCursors;
  uni.setNavigationBarTitle({ title: conversation.data.title });
  await reload(true);
  startLive();
}

async function reload(scrollBottom: boolean) {
  const result = await listMessages(tripId.value);
  if (result.code !== ErrorCode.OK || !result.data) {
    return;
  }
  messages.value = result.data;
  noMore.value = result.data.length < 30;
  await markLatest();
  if (scrollBottom) {
    await jumpBottom();
  }
}

async function loadOlder() {
  if (loadingOlder.value || noMore.value || !messages.value.length) {
    return;
  }
  loadingOlder.value = true;
  const firstId = messages.value[0].id;
  const result = await listMessages(tripId.value, firstId);
  loadingOlder.value = false;
  if (result.code !== ErrorCode.OK || !result.data) {
    return;
  }
  if (!result.data.length) {
    noMore.value = true;
    return;
  }
  messages.value = mergeMessages(result.data, messages.value);
  anchor.value = `m-${firstId}`;
}

function startLive() {
  stopLive();
  const token = getToken();
  if (!token) {
    return;
  }
  socket = connectLocationSocket(getWsUrl(token), {
    onOpen() {
      socket?.send({ type: "chat.subscribe", tripId: tripId.value });
      syncOk.value = true;
    },
    onClose() {
      syncOk.value = false;
    },
    onError() {
      syncOk.value = false;
    },
    onMessage: onSocketMessage,
  });
  pollTimer = setInterval(() => {
    if (!syncOk.value) {
      void reload(false);
    }
  }, CHAT_POLL_INTERVAL_MS);
}

function stopLive() {
  socket?.send({ type: "chat.unsubscribe" });
  socket?.close();
  socket = null;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function onSocketMessage(message: WsServerMessage) {
  if (message.type === "chat" && message.tripId === tripId.value) {
    append(message.message);
    return;
  }
  if (message.type === "chat.read" && message.tripId === tripId.value) {
    applyRead(message.userId, message.lastMessageId);
    return;
  }
  if (message.type === "ready") {
    socket?.send({ type: "chat.subscribe", tripId: tripId.value });
  }
}

async function onSend() {
  const content = draft.value.trim();
  if (!content || sending.value) {
    return;
  }
  sending.value = true;
  const result = await sendChatText(tripId.value, { content });
  sending.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    draft.value = "";
    append(result.data);
  }
}

function pickImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      const filePath = res.tempFilePaths[0];
      if (!filePath) {
        return;
      }
      sending.value = true;
      const result = await sendChatImage(tripId.value, filePath);
      sending.value = false;
      if (result.code === ErrorCode.OK && result.data) {
        append(result.data);
      }
    },
  });
}

function append(message: ChatMessage) {
  messages.value = mergeMessages(messages.value, [message]);
  if (!message.mine) {
    void markLatest();
  }
  void jumpBottom();
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<number, ChatMessage>();
  for (const item of [...current, ...incoming]) {
    map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => a.id - b.id);
}

async function markLatest() {
  const last = messages.value[messages.value.length - 1];
  if (!last) {
    return;
  }
  await markChatRead(tripId.value, last.id);
}

async function jumpBottom() {
  await nextTick();
  anchor.value = "";
  await nextTick();
  anchor.value = "chat-end";
}

function applyRead(userId: number, lastMessageId: number) {
  if (getProfile()?.id === userId) {
    return;
  }
  const current = cursors.value[userId] || 0;
  if (lastMessageId <= current) {
    return;
  }
  cursors.value = { ...cursors.value, [userId]: lastMessageId };
}

function otherMemberCount(): number {
  const fromRoster = Math.max(memberCount.value - 1, 0);
  const fromCursors = Object.keys(cursors.value).length;
  const fromThread = messages.value.some((item) => !item.mine && item.type !== "system") ? 1 : 0;
  return Math.max(fromRoster, fromCursors, fromThread);
}

function receiptText(item: ChatMessage): string {
  if (!item.mine || item.type === "system") {
    return "";
  }
  const others = otherMemberCount();
  if (others <= 0) {
    return "";
  }
  const me = getProfile()?.id;
  const fromCursors = Object.entries(cursors.value).filter(
    ([userId, last]) => Number(userId) !== me && last >= item.id,
  ).length;
  const count = Math.max(fromCursors, item.readCount || 0);
  if (count <= 0) {
    return "未读";
  }
  if (count >= others) {
    return others > 1 ? "全部已读" : "已读";
  }
  return `${count}人已读`;
}

function itemClass(item: ChatMessage) {
  if (item.type === "system") {
    return "chat__item--system";
  }
  return item.mine ? "chat__item--mine" : "chat__item--other";
}

function mediaUrl(url: string) {
  return resolveMediaUrl(url);
}

function preview(url: string) {
  uni.previewImage({ urls: [resolveMediaUrl(url)] });
}

function goBack() {
  uni.navigateBack();
}
</script>

<style scoped>
.chat {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f4f6f8;
}

.chat__empty {
  flex: 1;
}

.chat__scroller {
  flex: 1;
  height: 0;
  padding: 16rpx 24rpx 12rpx;
  box-sizing: border-box;
}

.chat__more {
  text-align: center;
  color: #9ca3af;
  font-size: 24rpx;
  padding: 12rpx 0;
}

.chat__item {
  margin-bottom: 20rpx;
  display: flex;
}

.chat__item--system {
  justify-content: center;
}

.chat__item--mine {
  justify-content: flex-end;
}

.chat__item--other {
  justify-content: flex-start;
}

.chat__system {
  font-size: 22rpx;
  color: #9ca3af;
  background: #e5e7eb;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
}

.chat__bubble-wrap {
  max-width: 78%;
  display: flex;
  flex-direction: column;
}

.chat__item--mine .chat__bubble-wrap {
  align-items: flex-end;
}

.chat__name {
  font-size: 22rpx;
  color: #9ca3af;
  margin-bottom: 6rpx;
}

.chat__meta {
  margin-top: 6rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.chat__item--mine .chat__meta {
  flex-direction: row-reverse;
}

.chat__time,
.chat__read {
  font-size: 20rpx;
  color: #9ca3af;
}

.chat__bubble {
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  font-size: 28rpx;
  line-height: 1.5;
  background: #fff;
  color: #111827;
}

.chat__item--mine .chat__bubble {
  background: #1d4f91;
  color: #fff;
}

.chat__image {
  width: 360rpx;
  border-radius: 12rpx;
  background: #e5e7eb;
}

.chat__bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 16rpx calc(12rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #e5e7eb;
}

.chat__input {
  flex: 1;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: 12rpx;
  background: #f3f4f6;
  font-size: 28rpx;
}
</style>
