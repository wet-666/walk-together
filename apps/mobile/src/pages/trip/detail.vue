<template>
  <view v-if="detail" class="detail">
    <view class="detail__hero">
      <text class="detail__title">{{ detail.title }}</text>
      <text class="detail__route">{{ detail.originName }} → {{ detail.destName }}</text>
      <text class="detail__meta">
        {{ formatDepartAt(detail.departAt) }} · {{ detail.estimatedDays }} 天 ·
        {{ detail.vehicleCount }}/{{ detail.maxVehicles }} 辆 · {{ statusLabel(detail.status) }}
      </text>
      <view class="detail__tags">
        <text class="detail__chip">{{ depthLabel(detail.companionDepth) }}</text>
        <text v-for="plan in detail.alongPlans" :key="plan" class="detail__chip">{{ planLabel(plan) }}</text>
        <text v-for="tag in detail.tags" :key="tag" class="detail__chip">{{ tag }}</text>
      </view>
    </view>

    <view class="detail__card">
      <text class="detail__h">路线</text>
      <text v-for="node in detail.nodes" :key="node.id" class="detail__node">
        {{ nodeLabel(node.kind) }} {{ node.name }}
      </text>
      <text v-if="detail.feeNote" class="detail__note">费用：{{ detail.feeNote }}</text>
      <text v-if="detail.announcement" class="detail__note">公告：{{ detail.announcement }}</text>
    </view>

    <view v-if="detail.inviteCode" class="detail__card">
      <text class="detail__h">邀请码</text>
      <text class="detail__code" @click="copyCode">{{ detail.inviteCode }}</text>
      <text class="detail__hint">把邀请码发给队友，对方在行程广场搜索即可申请。</text>
    </view>

    <view class="detail__card">
      <text class="detail__h">成员（{{ detail.members.length }}）</text>
      <view v-for="member in detail.members" :key="member.userId" class="detail__member">
        <view>
          <text class="detail__name">{{ member.nickname }}</text>
          <text class="detail__sub">
            {{ member.role === "captain" ? "队长" : "队员" }}
            {{ member.vehicleModel ? ` · ${member.vehicleModel}` : "" }}
          </text>
        </view>
        <wd-button
          v-if="isCaptain && member.role !== 'captain' && member.status === 'approved'"
          size="small"
          type="error"
          plain
          @click="onRemove(member.userId)"
        >
          移除
        </wd-button>
      </view>
    </view>

    <view v-if="isCaptain && detail.applications.length" class="detail__card">
      <text class="detail__h">待审批</text>
      <view v-for="item in detail.applications" :key="item.userId" class="detail__member">
        <view>
          <text class="detail__name">{{ item.nickname }}</text>
          <text class="detail__sub">
            {{ item.status === "leave_pending" ? "申请退出" : "申请加入" }}
            {{ item.applyMessage ? ` · ${item.applyMessage}` : "" }}
          </text>
        </view>
        <view class="detail__ops">
          <wd-button size="small" type="primary" @click="onDecide(item.userId, true)">同意</wd-button>
          <wd-button size="small" plain @click="onDecide(item.userId, false)">拒绝</wd-button>
        </view>
      </view>
    </view>

    <view v-if="canApply" class="detail__card">
      <text class="detail__h">申请加入</text>
      <textarea v-model="applyMessage" class="detail__textarea" maxlength="120" placeholder="给队长留一句话（选填）" />
      <wd-button type="primary" block :disabled="detail.isFull" @click="onApply">
        {{ detail.isFull ? "已满员" : "申请加入" }}
      </wd-button>
    </view>

    <view v-if="myStatus === 'pending'" class="detail__hint">已提交申请，等待队长审批。</view>
    <view v-if="myStatus === 'leave_pending'" class="detail__hint">退出申请已提交，等待队长审批。</view>

    <view class="detail__actions">
      <wd-button v-if="isMember" type="primary" plain block @click="goChat">打开车队群聊</wd-button>
      <wd-button v-if="isMember" plain block @click="goCopy">个人副本</wd-button>
      <wd-button v-if="isMember && !isCaptain" plain block @click="onLeave">申请退出</wd-button>
      <wd-button v-if="isCaptain && detail.status === 'recruiting'" type="primary" block @click="onStart">开始行程</wd-button>
      <wd-button v-if="isCaptain && detail.status === 'ongoing'" type="primary" block @click="onEnd">结束行程</wd-button>
      <wd-button v-if="isCaptain && (detail.status === 'recruiting' || detail.status === 'ongoing')" type="error" plain block @click="onCancel">解散行程</wd-button>
    </view>
  </view>
  <view v-else class="detail__hint">{{ emptyText }}</view>
</template>

<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import {
  ErrorCode,
  type AlongPlanValue,
  type CompanionDepthValue,
  type TripDetail,
} from "@walk-together/shared-types";
import { computed, ref } from "vue";
import {
  applyTrip,
  approveMember,
  cancelTrip,
  endTrip,
  formatDepartAt,
  getTrip,
  leaveTrip,
  rejectMember,
  removeMember,
  startTrip,
} from "../../api/trip";
import { ensureLogin } from "../../store/session";

const detail = ref<TripDetail | null>(null);
const applyMessage = ref("");
const emptyText = ref("加载中…");
const tripId = ref(0);
const inviteCode = ref("");

const isCaptain = computed(() => detail.value?.myMember?.role === "captain");
const myStatus = computed(() => detail.value?.myMember?.status || null);
const isMember = computed(() => myStatus.value === "approved" || myStatus.value === "leave_pending");
const canApply = computed(() => {
  if (!detail.value || detail.value.status !== "recruiting") {
    return false;
  }
  return !detail.value.myMember || detail.value.myMember.status === "rejected" || detail.value.myMember.status === "left";
});

onLoad((query) => {
  tripId.value = Number(query?.id || 0);
  inviteCode.value = String(query?.code || "").toUpperCase();
  void refresh();
});

async function refresh() {
  if (!tripId.value) {
    emptyText.value = "行程不存在";
    return;
  }
  const result = await getTrip(tripId.value, inviteCode.value || undefined);
  if (result.code === ErrorCode.OK && result.data) {
    detail.value = result.data;
    return;
  }
  detail.value = null;
  emptyText.value = result.message || "行程不存在";
}

async function onApply() {
  if (!ensureLogin(`/pages/trip/detail?id=${tripId.value}&code=${inviteCode.value}`)) {
    return;
  }
  const result = await applyTrip(tripId.value, { message: applyMessage.value });
  if (result.code === ErrorCode.OK && result.data) {
    detail.value = result.data;
    uni.showToast({ title: "已提交申请", icon: "none" });
  }
}

async function onDecide(userId: number, ok: boolean) {
  const result = ok
    ? await approveMember(tripId.value, userId)
    : await rejectMember(tripId.value, userId);
  if (result.code === ErrorCode.OK && result.data) {
    detail.value = result.data;
  }
}

async function onRemove(userId: number) {
  const result = await removeMember(tripId.value, userId);
  if (result.code === ErrorCode.OK && result.data) {
    detail.value = result.data;
  }
}

async function onLeave() {
  const result = await leaveTrip(tripId.value);
  if (result.code === ErrorCode.OK && result.data) {
    detail.value = result.data;
    uni.showToast({ title: "已申请退出", icon: "none" });
  }
}

async function onStart() {
  const result = await startTrip(tripId.value);
  if (result.code === ErrorCode.OK && result.data) {
    detail.value = result.data;
  }
}

async function onEnd() {
  const result = await endTrip(tripId.value);
  if (result.code === ErrorCode.OK && result.data) {
    detail.value = result.data;
  }
}

async function onCancel() {
  uni.showModal({
    title: "解散行程",
    content: "解散后不能再加入。确定吗？",
    success: async (res) => {
      if (!res.confirm) {
        return;
      }
      const result = await cancelTrip(tripId.value);
      if (result.code === ErrorCode.OK && result.data) {
        detail.value = result.data;
      }
    },
  });
}

function goChat() {
  uni.navigateTo({ url: `/pages/message/chat?id=${tripId.value}` });
}

function goCopy() {
  uni.navigateTo({ url: `/pages/trip/copy?id=${tripId.value}` });
}

function copyCode() {
  if (!detail.value?.inviteCode) {
    return;
  }
  uni.setClipboardData({ data: detail.value.inviteCode });
}

function statusLabel(status: string): string {
  if (status === "recruiting") return "招募中";
  if (status === "ongoing") return "进行中";
  if (status === "ended") return "已结束";
  return "已解散";
}

function depthLabel(value: CompanionDepthValue): string {
  if (value === "shallow") return "同路浅";
  if (value === "deep") return "同路深";
  return "同路中";
}

function planLabel(value: AlongPlanValue): string {
  if (value === "aa") return "AA";
  if (value === "dining") return "拼桌";
  if (value === "sightseeing") return "同逛";
  return "互助";
}

function nodeLabel(kind: string): string {
  if (kind === "origin") return "起点";
  if (kind === "dest") return "终点";
  return "途经";
}
</script>

<style scoped>
.detail {
  padding: 24rpx 24rpx 64rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.detail__hero,
.detail__card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.detail__title {
  font-size: 36rpx;
  font-weight: 700;
}

.detail__route {
  font-size: 28rpx;
  color: #1f2937;
}

.detail__meta,
.detail__hint,
.detail__note,
.detail__sub,
.detail__node {
  font-size: 24rpx;
  color: #6b7280;
}

.detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.detail__chip {
  font-size: 22rpx;
  color: #1d4f91;
  background: #eef3f9;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
}

.detail__h {
  font-size: 28rpx;
  font-weight: 600;
}

.detail__code {
  font-size: 48rpx;
  letter-spacing: 8rpx;
  font-weight: 700;
  color: #1d4f91;
}

.detail__member {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12rpx;
  padding: 8rpx 0;
}

.detail__name {
  font-size: 28rpx;
}

.detail__ops,
.detail__actions {
  display: flex;
  gap: 12rpx;
}

.detail__actions {
  flex-direction: column;
}

.detail__textarea {
  width: 100%;
  min-height: 140rpx;
  padding: 16rpx;
  background: #f4f6f8;
  border-radius: 12rpx;
  font-size: 26rpx;
}

.detail__hint {
  text-align: center;
  padding: 24rpx;
}
</style>
