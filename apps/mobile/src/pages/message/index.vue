<template>
  <view class="msg">
    <view v-if="!loggedIn" class="msg__empty">
      <EmptyState
        title="登录后才能看车队群"
        description="入队之后这儿会出现车队群。"
        action-text="去登录"
        @action="goLogin"
      />
    </view>

    <view v-else-if="loading && !items.length" class="msg__hint">加载中…</view>

    <EmptyState
      v-else-if="!items.length"
      title="还没有车队群"
      description="加入车队后这里会出现群聊。"
      action-text="去行程广场"
      @action="goTrip"
    />

    <view v-else class="msg__list">
      <view
        v-for="item in items"
        :key="item.tripId"
        class="msg__card"
        @click="openChat(item.tripId)"
      >
        <view class="msg__avatar">{{ item.title.slice(0, 1) }}</view>
        <view class="msg__body">
          <view class="msg__row">
            <text class="msg__title">{{ item.title }}</text>
            <text class="msg__time">{{ formatChatTime(item.updatedAt) }}</text>
          </view>
          <view class="msg__row">
            <text class="msg__preview">{{ preview(item) }}</text>
            <text v-if="item.unreadCount" class="msg__badge">{{ badge(item.unreadCount) }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onHide, onShow } from "@dcloudio/uni-app";
import {
  CHAT_POLL_INTERVAL_MS,
  ErrorCode,
  type ChatConversation,
} from "@walk-together/shared-types";
import { ref } from "vue";
import { applyUnreadBadge, listConversations, refreshUnreadBadge } from "../../api/im";
import EmptyState from "../../components/EmptyState.vue";
import { prepareIm } from "../../native/im";
import { onInboxChat } from "../../store/chat-inbox";
import { ensureLogin, isLoggedIn } from "../../store/session";
import { formatChatTime } from "../../utils/datetime";

const loggedIn = ref(false);
const loading = ref(false);
const items = ref<ChatConversation[]>([]);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let offInbox: (() => void) | null = null;

onShow(() => {
  loggedIn.value = isLoggedIn();
  if (!loggedIn.value) {
    items.value = [];
    applyUnreadBadge(0);
    return;
  }
  void prepareIm();
  void refresh();
  startPoll();
  offInbox?.();
  offInbox = onInboxChat(() => {
    void refresh();
  });
});

onHide(() => {
  stopPoll();
  offInbox?.();
  offInbox = null;
});

async function refresh() {
  loading.value = true;
  const result = await listConversations();
  loading.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    items.value = result.data;
    applyUnreadBadge(result.data.reduce((sum, item) => sum + item.unreadCount, 0));
    return;
  }
  items.value = [];
  await refreshUnreadBadge();
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    void refresh();
  }, CHAT_POLL_INTERVAL_MS);
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function openChat(tripId: number) {
  uni.navigateTo({ url: `/pages/message/chat?id=${tripId}` });
}

function goLogin() {
  ensureLogin("/pages/message/index");
}

function goTrip() {
  uni.switchTab({ url: "/pages/trip/index" });
}

function preview(item: ChatConversation): string {
  const last = item.lastMessage;
  if (!last) {
    return `${item.memberCount} 人 · 进群打个招呼`;
  }
  if (last.type === "image") {
    return `${last.senderNickname}: [图片]`;
  }
  if (last.type === "system") {
    return last.content;
  }
  return `${last.senderNickname}: ${last.content}`;
}

function badge(count: number): string {
  return count > 99 ? "99+" : String(count);
}
</script>

<style scoped>
.msg {
  min-height: 100vh;
  background: #f4f6f8;
}

.msg__empty,
.msg__hint {
  padding: 24rpx;
}

.msg__hint {
  color: #6b7280;
  font-size: 28rpx;
}

.msg__list {
  padding: 16rpx 0 40rpx;
  background: #fff;
}

.msg__card {
  display: flex;
  gap: 20rpx;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f3f4f6;
}

.msg__avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 20rpx;
  background: #1d4f91;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  flex-shrink: 0;
}

.msg__body {
  flex: 1;
  min-width: 0;
}

.msg__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.msg__title {
  font-size: 32rpx;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg__time {
  color: #9ca3af;
  font-size: 22rpx;
  flex-shrink: 0;
}

.msg__preview {
  margin-top: 8rpx;
  color: #6b7280;
  font-size: 26rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg__badge {
  margin-top: 8rpx;
  min-width: 36rpx;
  padding: 0 10rpx;
  height: 36rpx;
  line-height: 36rpx;
  border-radius: 18rpx;
  background: #ef4444;
  color: #fff;
  font-size: 20rpx;
  text-align: center;
  flex-shrink: 0;
}
</style>
