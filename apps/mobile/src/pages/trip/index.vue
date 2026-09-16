<template>
  <view class="trip">
    <view class="trip__bar">
      <view class="trip__tabs">
        <text
          class="trip__tab"
          :class="{ 'trip__tab--on': tab === 'plaza' }"
          @click="switchTab('plaza')"
        >
          广场
        </text>
        <text
          class="trip__tab"
          :class="{ 'trip__tab--on': tab === 'mine' }"
          @click="switchTab('mine')"
        >
          我的
        </text>
      </view>
      <view class="trip__search">
        <wd-input
          v-model="keyword"
          placeholder="搜索标题 / 地点 / 邀请码"
          clearable
          @confirm="onSearch"
        />
        <wd-button size="small" @click="onSearch">搜</wd-button>
      </view>
    </view>

    <view v-if="loading && !items.length" class="trip__hint">加载中…</view>
    <EmptyState
      v-else-if="!items.length"
      :title="tab === 'mine' ? '还没有自己的行程' : '还没有可加入的行程'"
      description="发布一条路线，邀请另一辆车加入。两人成队之后，地图和群聊才会有内容。"
      action-text="发布行程"
      @action="goPublish"
    />
    <view v-else class="trip__list">
      <view
        v-for="item in items"
        :key="item.id"
        class="trip__card"
        @click="goDetail(item)"
      >
        <view class="trip__card-top">
          <text class="trip__title">{{ item.title }}</text>
          <wd-tag mark>{{ statusText(item) }}</wd-tag>
        </view>
        <text class="trip__route">{{ item.originName }} → {{ item.destName }}</text>
        <text class="trip__meta">
          {{ formatDepartAt(item.departAt) }} · {{ item.vehicleCount }}/{{ item.maxVehicles }} 辆 ·
          {{ item.captainNickname }}
          <text v-if="item.distanceKm != null"> · {{ item.distanceKm }}km</text>
        </text>
        <view v-if="item.tags.length" class="trip__tags">
          <text v-for="tag in item.tags" :key="tag" class="trip__chip">{{ tag }}</text>
        </view>
      </view>
    </view>

    <view class="trip__fab">
      <wd-button type="primary" block @click="goPublish">发布行程</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ErrorCode, type TripSummary } from "@walk-together/shared-types";
import { ref } from "vue";
import EmptyState from "../../components/EmptyState.vue";
import { formatDepartAt, listMine, listPlaza, memberLabel } from "../../api/trip";
import { ensureLogin, isLoggedIn } from "../../store/session";

const tab = ref<"plaza" | "mine">("plaza");
const keyword = ref("");
const items = ref<TripSummary[]>([]);
const loading = ref(false);
const inviteCode = ref("");
const here = ref<{ lng: number; lat: number } | null>(null);

onShow(() => {
  locate();
  void refresh();
});

function switchTab(next: "plaza" | "mine") {
  if (next === "mine" && !ensureLogin("/pages/trip/index")) {
    return;
  }
  tab.value = next;
  void refresh();
}

function locate() {
  uni.getLocation({
    type: "gcj02",
    success: (res) => {
      here.value = { lng: res.longitude, lat: res.latitude };
    },
    fail: () => {
      here.value = null;
    },
  });
}

async function refresh() {
  loading.value = true;
  const result =
    tab.value === "mine"
      ? await listMine()
      : await listPlaza({
          keyword: isInviteCode(keyword.value) ? undefined : keyword.value.trim() || undefined,
          code: isInviteCode(keyword.value) ? keyword.value.trim().toUpperCase() : undefined,
          lng: here.value?.lng,
          lat: here.value?.lat,
          sort: here.value ? "distance" : "time",
        });
  loading.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    items.value = result.data;
    if (isInviteCode(keyword.value) && result.data[0]) {
      inviteCode.value = keyword.value.trim().toUpperCase();
    }
    return;
  }
  items.value = [];
}

function onSearch() {
  if (tab.value === "mine" && !isLoggedIn()) {
    ensureLogin("/pages/trip/index");
    return;
  }
  void refresh();
}

function goPublish() {
  if (!ensureLogin("/pages/trip/publish")) {
    return;
  }
  uni.navigateTo({ url: "/pages/trip/publish" });
}

function goDetail(item: TripSummary) {
  const code = isInviteCode(keyword.value) ? keyword.value.trim().toUpperCase() : inviteCode.value;
  const query = code ? `?id=${item.id}&code=${code}` : `?id=${item.id}`;
  uni.navigateTo({ url: `/pages/trip/detail${query}` });
}

function isInviteCode(value: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/i.test(value.trim());
}

function statusText(item: TripSummary): string {
  return memberLabel(item.myStatus) || `${item.vehicleCount}/${item.maxVehicles}`;
}
</script>

<style scoped>
.trip {
  min-height: 100vh;
  padding-bottom: 160rpx;
}

.trip__bar {
  padding: 16rpx 24rpx 8rpx;
  background: #fff;
}

.trip__tabs {
  display: flex;
  gap: 24rpx;
  margin-bottom: 16rpx;
}

.trip__tab {
  font-size: 30rpx;
  color: #6b7280;
  padding-bottom: 8rpx;
}

.trip__tab--on {
  color: #1d4f91;
  font-weight: 600;
  border-bottom: 4rpx solid #1d4f91;
}

.trip__search {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.trip__search :deep(.wd-input) {
  flex: 1;
}

.trip__hint {
  padding: 48rpx;
  text-align: center;
  color: #9ca3af;
}

.trip__list {
  padding: 16rpx 24rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.trip__card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
}

.trip__card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}

.trip__title {
  font-size: 32rpx;
  font-weight: 600;
  color: #111827;
}

.trip__route,
.trip__meta {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #6b7280;
}

.trip__tags {
  margin-top: 12rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.trip__chip {
  font-size: 22rpx;
  color: #1d4f91;
  background: #eef3f9;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
}

.trip__fab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 48rpx calc(24rpx + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, transparent, #f4f6f8 30%);
}
</style>
