<template>
  <!-- #ifdef MP-WEIXIN || APP-PLUS -->
  <page-meta :disable-scroll="tab === 'plaza' && plazaView === 'map'" />
  <!-- #endif -->
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
        <wd-button size="small" type="primary" custom-class="trip__publish" @click="goPublish">
          发布行程
        </wd-button>
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
      <view v-if="tab === 'plaza'" class="trip__filters">
        <wd-input
          v-model="dest"
          placeholder="目的地"
          clearable
          @confirm="onSearch"
        />
        <picker mode="date" :value="departDay" @change="onDepartDay">
          <view class="trip__date">{{ departDay || "出发日期" }}</view>
        </picker>
        <text v-if="departDay" class="trip__clear" @click="clearDay">清除</text>
        <view class="trip__views">
          <text
            class="trip__view"
            :class="{ 'trip__view--on': plazaView === 'list' }"
            @click="plazaView = 'list'"
          >
            列表
          </text>
          <text
            class="trip__view"
            :class="{ 'trip__view--on': plazaView === 'map' }"
            @click="plazaView = 'map'"
          >
            地图
          </text>
        </view>
      </view>
    </view>

    <view v-if="tab === 'plaza' && plazaView === 'map'" class="trip__map">
      <PickMap
        :markers="mapMarks"
        :center="here"
        @select="onMapSelect"
      />
      <text class="trip__map-hint">
        {{ mapMarks.length ? "点标记看车队详情" : "还没有带坐标的招募车队，可切回列表或去发布" }}
      </text>
    </view>

    <view v-else-if="loading && !items.length" class="trip__hint">加载中…</view>
    <EmptyState
      v-else-if="!items.length"
      :title="tab === 'mine' ? '还没有自己的行程' : '还没有可加入的行程'"
      description="发一条路线，等人加入就能在地图上看见对方。"
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
          <image
            v-if="item.coverUrl"
            class="trip__cover"
            mode="aspectFill"
            :src="coverSrc(item.coverUrl)"
          />
          <view class="trip__card-body">
            <view class="trip__card-head">
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
      </view>
    </view>

    <view v-if="plazaView !== 'map' || tab !== 'plaza'" class="trip__fab">
      <wd-button type="primary" block @click="goPublish">发布行程</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ErrorCode, type TripSummary } from "@walk-together/shared-types";
import { computed, ref } from "vue";
import EmptyState from "../../components/EmptyState.vue";
import PickMap from "../../components/PickMap.vue";
import { listMine, listPlaza, memberLabel, formatDepartAt } from "../../api/trip";
import { resolveMediaUrl } from "../../config/env";
import { locateDevice } from "../../native/geolocation";
import { ensureLogin, isLoggedIn } from "../../store/session";

const tab = ref<"plaza" | "mine">("plaza");
const plazaView = ref<"list" | "map">("list");
const keyword = ref("");
const dest = ref("");
const departDay = ref("");
const items = ref<TripSummary[]>([]);
const loading = ref(false);
const inviteCode = ref("");
const here = ref<{ lng: number; lat: number } | null>(null);

const mapMarks = computed(() =>
  items.value.flatMap((item) => {
    const point =
      item.originLng != null && item.originLat != null
        ? { lng: item.originLng, lat: item.originLat }
        : item.destLng != null && item.destLat != null
          ? { lng: item.destLng, lat: item.destLat }
          : null;
    if (!point) {
      return [];
    }
    return [
      {
        id: String(item.id),
        lng: point.lng,
        lat: point.lat,
        title: item.title,
      },
    ];
  }),
);

onShow(() => {
  locate();
  void refresh();
});

function switchTab(next: "plaza" | "mine") {
  if (next === "mine" && !ensureLogin("/pages/trip/index")) {
    return;
  }
  tab.value = next;
  if (next === "mine") {
    plazaView.value = "list";
  }
  void refresh();
}

function locate() {
  void locateDevice().then((result) => {
    if (result.location) {
      here.value = { lng: result.location.lng, lat: result.location.lat };
    }
  });
}

async function refresh() {
  loading.value = true;
  const result =
    tab.value === "mine"
      ? await listMine()
      : await listPlaza({
          keyword: isInviteCode(keyword.value) ? undefined : keyword.value.trim() || undefined,
          dest: dest.value.trim() || undefined,
          departFrom: departDay.value || undefined,
          departTo: departDay.value || undefined,
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

function onDepartDay(e: { detail: { value: string } }) {
  departDay.value = e.detail.value;
  void refresh();
}

function clearDay() {
  departDay.value = "";
  void refresh();
}

function onMapSelect(id: string) {
  const item = items.value.find((row) => String(row.id) === id);
  if (item) {
    goDetail(item);
  }
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

function coverSrc(url: string) {
  return resolveMediaUrl(url);
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
  align-items: center;
  gap: 24rpx;
  margin-bottom: 16rpx;
}

.trip__publish {
  margin-left: auto;
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

.trip__search,
.trip__filters {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.trip__filters {
  margin-top: 12rpx;
  flex-wrap: wrap;
}

.trip__search :deep(.wd-input) {
  flex: 1;
  min-width: 0;
}

.trip__filters :deep(.wd-input) {
  flex: 1 1 100%;
  min-width: 180rpx;
}

.trip__date {
  padding: 16rpx 20rpx;
  background: #f4f6f8;
  border-radius: 12rpx;
  font-size: 24rpx;
  color: #4b5563;
}

.trip__clear {
  font-size: 24rpx;
  color: #1d4f91;
}

.trip__views {
  display: flex;
  background: #f4f6f8;
  border-radius: 999rpx;
  padding: 4rpx;
}

.trip__view {
  font-size: 24rpx;
  color: #6b7280;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
}

.trip__view--on {
  background: #1d4f91;
  color: #fff;
}

.trip__hint {
  padding: 48rpx;
  text-align: center;
  color: #9ca3af;
}

.trip__map {
  height: calc(100vh - 280rpx - var(--window-bottom, 50px) - var(--window-top, 44px));
  min-height: 480rpx;
  margin: 12rpx 24rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.trip__map-hint {
  font-size: 22rpx;
  color: #6b7280;
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
  padding: 20rpx;
}

.trip__card-top {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
}

.trip__cover {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  background: #e5e7eb;
  flex-shrink: 0;
}

.trip__card-body {
  flex: 1;
  min-width: 0;
}

.trip__card-head {
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
  bottom: calc(var(--window-bottom, 50px) + 12px);
  z-index: 20;
  padding: 16rpx 48rpx calc(12rpx + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, transparent, #f4f6f8 30%);
}
</style>
