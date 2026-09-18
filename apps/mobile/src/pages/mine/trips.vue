<template>
  <view class="mine-trips">
    <view class="mine-trips__tabs">
      <text
        class="mine-trips__tab"
        :class="{ 'mine-trips__tab--on': tab === 'active' }"
        @click="tab = 'active'"
      >
        进行中 {{ activeItems.length }}
      </text>
      <text
        class="mine-trips__tab"
        :class="{ 'mine-trips__tab--on': tab === 'history' }"
        @click="tab = 'history'"
      >
        历史 {{ historyItems.length }}
      </text>
    </view>

    <view v-if="loading && !items.length" class="mine-trips__hint">加载中…</view>
    <EmptyState
      v-else-if="!visibleItems.length"
      :title="tab === 'active' ? '还没有进行中的行程' : '还没有历史行程'"
      description="参加过的行程会列在这儿。"
      action-text="去行程广场"
      @action="goPlaza"
    />
    <view v-else class="mine-trips__list">
      <view
        v-for="item in visibleItems"
        :key="item.id"
        class="mine-trips__card"
        @click="goDetail(item.id)"
      >
        <view class="mine-trips__top">
          <image
            v-if="item.coverUrl"
            class="mine-trips__cover"
            mode="aspectFill"
            :src="coverSrc(item.coverUrl)"
          />
          <view class="mine-trips__body">
            <view class="mine-trips__head">
              <text class="mine-trips__title">{{ item.title }}</text>
              <wd-tag mark>{{ roleText(item) }}</wd-tag>
            </view>
            <text class="mine-trips__route">{{ item.originName }} → {{ item.destName }}</text>
            <text class="mine-trips__meta">
              {{ formatDepartAt(item.departAt) }} · {{ tripStatusText(item.status) }} ·
              {{ memberLabel(item.myStatus) || `${item.vehicleCount}/${item.maxVehicles} 辆` }}
            </text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from "@dcloudio/uni-app";
import { ErrorCode, type TripStatusValue, type TripSummary } from "@walk-together/shared-types";
import { computed, ref } from "vue";
import EmptyState from "../../components/EmptyState.vue";
import { formatDepartAt, listMine, memberLabel } from "../../api/trip";
import { resolveMediaUrl } from "../../config/env";

const tab = ref<"active" | "history">("active");
const items = ref<TripSummary[]>([]);
const loading = ref(false);

const activeItems = computed(() => items.value.filter(isActiveMine));
const historyItems = computed(() => items.value.filter((item) => !isActiveMine(item)));
const visibleItems = computed(() => (tab.value === "active" ? activeItems.value : historyItems.value));

onLoad((query) => {
  if (query?.tab === "history") {
    tab.value = "history";
  }
});

onShow(() => {
  void refresh();
});

async function refresh() {
  loading.value = true;
  const result = await listMine("all");
  loading.value = false;
  items.value = result.code === ErrorCode.OK && result.data ? result.data : [];
}

function isActiveMine(item: TripSummary): boolean {
  const liveTrip = item.status === "recruiting" || item.status === "ongoing";
  const liveMember =
    item.myStatus === "approved" || item.myStatus === "pending" || item.myStatus === "leave_pending";
  return liveTrip && liveMember;
}

function roleText(item: TripSummary): string {
  if (item.myRole === "captain") {
    return "队长";
  }
  if (item.myStatus === "pending") {
    return "申请中";
  }
  return "队员";
}

function tripStatusText(status: TripStatusValue): string {
  if (status === "ongoing") {
    return "进行中";
  }
  if (status === "ended") {
    return "已结束";
  }
  if (status === "cancelled") {
    return "已解散";
  }
  return "招募中";
}

function goDetail(id: number) {
  uni.navigateTo({ url: `/pages/trip/detail?id=${id}` });
}

function goPlaza() {
  uni.switchTab({ url: "/pages/trip/index" });
}

function coverSrc(url: string) {
  return resolveMediaUrl(url);
}
</script>

<style scoped>
.mine-trips {
  min-height: 100vh;
  padding-bottom: 48rpx;
}

.mine-trips__tabs {
  display: flex;
  gap: 32rpx;
  padding: 16rpx 32rpx 8rpx;
  background: #fff;
}

.mine-trips__tab {
  font-size: 30rpx;
  color: #6b7280;
  padding-bottom: 8rpx;
}

.mine-trips__tab--on {
  color: #1d4f91;
  font-weight: 600;
  border-bottom: 4rpx solid #1d4f91;
}

.mine-trips__hint {
  padding: 48rpx;
  color: #6b7280;
  text-align: center;
}

.mine-trips__list {
  padding: 16rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.mine-trips__card {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
}

.mine-trips__top {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
}

.mine-trips__cover {
  width: 144rpx;
  height: 144rpx;
  border-radius: 12rpx;
  background: #e5e7eb;
  flex-shrink: 0;
}

.mine-trips__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.mine-trips__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.mine-trips__title {
  font-size: 32rpx;
  font-weight: 600;
  color: #111827;
}

.mine-trips__route,
.mine-trips__meta {
  font-size: 26rpx;
  color: #6b7280;
}
</style>
