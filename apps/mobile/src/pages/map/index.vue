<template>
  <view class="map-page">
    <view v-if="!loggedIn" class="map-page__empty">
      <EmptyState
        title="登录后才能看见队友"
        description="组队之后，这里会显示你、队友和本队路线。"
        action-text="去登录"
        @action="goLogin"
      />
    </view>

    <view v-else-if="!snapshot" class="map-page__empty">
      <EmptyState
        title="加入行程后这里会出现地图"
        description="点「发布行程」自己组队，或去行程广场加入别人的队伍。成队后才会出现路线和队友位置。"
        action-text="发布行程"
        extra-action-text="去行程广场加入"
        @action="goPublish"
        @extra="goTrip"
      />
    </view>

    <view v-else class="map-page__stage">
      <TeamMap
        :snapshot="snapshot"
        :members="members"
        :self-user-id="selfUserId"
        @engine="onMapEngine"
      />

      <view class="map-page__hud">
        <view class="map-page__title">
          <text class="map-page__name">{{ snapshot.title }}</text>
          <wd-tag :type="syncType" mark>{{ syncText }}</wd-tag>
        </view>
        <text class="map-page__route">{{ snapshot.originName }} → {{ snapshot.destName }}</text>
        <text class="map-page__hint">{{ locateHint }}</text>
        <text class="map-page__hint">{{ mapHint }}</text>
        <view class="map-page__people">
          <text v-for="item in memberLabels" :key="item.userId" class="map-page__chip">
            {{ item.text }}
          </text>
        </view>
      </view>

      <view class="map-page__pad">
        <text class="map-page__pad-title">{{ padTitle }}</text>
        <view class="map-page__pad-row">
          <wd-button size="small" @click="nudge(0, 1)">北</wd-button>
        </view>
        <view class="map-page__pad-row">
          <wd-button size="small" @click="nudge(-1, 0)">西</wd-button>
          <wd-button size="small" @click="nudge(0, 0)">复位</wd-button>
          <wd-button size="small" @click="nudge(1, 0)">东</wd-button>
        </view>
        <view class="map-page__pad-row">
          <wd-button size="small" @click="nudge(0, -1)">南</wd-button>
        </view>
        <wd-button size="small" plain block @click="askLocate">重新定位</wd-button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onHide, onShow } from "@dcloudio/uni-app";
import {
  ErrorCode,
  type LocationPoint,
  type TripMapSnapshot,
  type WsServerMessage,
} from "@walk-together/shared-types";
import { computed, ref } from "vue";
import { getActiveMap, getTripMap, getWsUrl, reportLocation } from "../../api/location";
import EmptyState from "../../components/EmptyState.vue";
import TeamMap from "../../components/TeamMap.vue";
import { demoStepMeters, locateDevice, offsetLngLat } from "../../native/geolocation";
import { connectLocationSocket, type LocationSocket } from "../../native/location-socket";
import { ensureLogin, getProfile, getToken, isLoggedIn } from "../../store/session";

const loggedIn = ref(false);
const snapshot = ref<TripMapSnapshot | null>(null);
const members = ref<LocationPoint[]>([]);
const mapEngine = ref<"amap" | "photo" | "schematic" | "native">("schematic");
const sync = ref<"ws" | "poll" | "offline">("offline");
const east = ref(0);
const north = ref(0);
const locateStatus = ref<"gps" | "denied" | "unavailable" | "timeout" | "idle">("idle");
const selfUserId = computed(() => getProfile()?.id ?? null);

const locateHint = computed(() => {
  if (locateStatus.value === "gps") {
    return "已用手机/浏览器定位";
  }
  if (locateStatus.value === "denied") {
    return "浏览器拒绝了定位。允许定位，或用下面方向键移动自己（不会改路线）。";
  }
  return "电脑通常拿不到 GPS。点方向键只移动自己的点，不会改路线。";
});

const mapHint = computed(() => {
  if (mapEngine.value === "amap" || mapEngine.value === "native") {
    return "可拖动、双指/滚轮缩放。默认看当前位置附近街区，点「看全程」才缩到整条路线。";
  }
  if (mapEngine.value === "photo") {
    return "现在是静态底图。要拖动看路名，需要高德 JS Key 生效。";
  }
  return "现在是示意图。H5 需要配置高德 JS Key 才会出现可拖动的街区底图。";
});

function onMapEngine(value: "amap" | "photo" | "schematic" | "native") {
  mapEngine.value = value;
}

const padTitle = computed(() =>
  locateStatus.value === "gps" ? "微调我的位置" : "电脑没定位时，点这里移动自己",
);

const syncText = computed(() => {
  if (sync.value === "ws") {
    return "实时";
  }
  if (sync.value === "poll") {
    return "轮询";
  }
  return "离线";
});
const syncType = computed(() => {
  if (sync.value === "ws") {
    return "success";
  }
  if (sync.value === "poll") {
    return "warning";
  }
  return "default";
});

const memberLabels = computed(() => {
  const liveIds = new Set(members.value.map((item) => item.userId));
  return (snapshot.value?.roster ?? []).map((item) => {
    const live = members.value.find((point) => point.userId === item.userId);
    const mine = item.userId === selfUserId.value;
    const state = live?.online ? "在线" : liveIds.has(item.userId) ? "刚离开" : "未上报";
    return {
      userId: item.userId,
      text: `${mine ? "我" : item.nickname} · ${state}`,
    };
  });
});

let reportTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let socket: LocationSocket | null = null;
let active = false;
let lastFix: { lng: number; lat: number } | null = null;

onShow(() => {
  loggedIn.value = isLoggedIn();
  if (!loggedIn.value) {
    stop();
    snapshot.value = null;
    return;
  }
  void start();
});

onHide(() => {
  stop();
});

function goLogin() {
  ensureLogin("/pages/map/index");
}

function goTrip() {
  uni.switchTab({ url: "/pages/trip/index" });
}

function goPublish() {
  if (!ensureLogin("/pages/trip/publish")) {
    return;
  }
  uni.navigateTo({ url: "/pages/trip/publish" });
}

function nudge(dirEast: number, dirNorth: number) {
  if (dirEast === 0 && dirNorth === 0) {
    east.value = 0;
    north.value = 0;
  } else {
    const step = demoStepMeters(nudgePoints.value);
    east.value += dirEast * step;
    north.value += dirNorth * step;
  }
  void publishLocation();
  uni.showToast({
    title: dirEast === 0 && dirNorth === 0 ? "已回到起点附近" : "已移动我的位置，路线不会变",
    icon: "none",
  });
}

const nudgePoints = computed(() => {
  const line = snapshot.value?.polyline?.length
    ? snapshot.value.polyline
    : (snapshot.value?.nodes ?? []).filter((item) => item.lng != null && item.lat != null);
  return line.map((item) => ({ lng: item.lng as number, lat: item.lat as number }));
});

async function askLocate() {
  const result = await locateDevice();
  locateStatus.value = result.status;
  if (result.location) {
    lastFix = result.location;
    east.value = 0;
    north.value = 0;
    void publishLocation();
    uni.showToast({ title: "已更新定位", icon: "none" });
    return;
  }
  uni.showToast({ title: "还是没拿到定位，用手点方向键移动", icon: "none" });
}

async function start() {
  stop();
  active = true;
  const loaded = await loadSnapshot();
  if (!loaded || !active) {
    return;
  }
  connectSocket(loaded.tripId);
  void publishLocation();
  const reportEvery = loaded.reportIntervalMs || 5000;
  const pollEvery = loaded.pollIntervalMs || 30000;
  reportTimer = setInterval(() => {
    void publishLocation();
  }, reportEvery);
  pollTimer = setInterval(() => {
    if (sync.value !== "ws") {
      void refreshSnapshot(loaded.tripId);
    }
  }, pollEvery);
}

function stop() {
  active = false;
  if (reportTimer) {
    clearInterval(reportTimer);
    reportTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  socket?.close();
  socket = null;
  sync.value = "offline";
}

async function loadSnapshot(): Promise<TripMapSnapshot | null> {
  const result = await getActiveMap();
  if (result.code !== ErrorCode.OK) {
    snapshot.value = null;
    members.value = [];
    return null;
  }
  snapshot.value = result.data;
  members.value = result.data?.members ?? [];
  return result.data;
}

async function refreshSnapshot(tripId: number) {
  const result = await getTripMap(tripId);
  if (result.code === ErrorCode.OK && result.data) {
    snapshot.value = result.data;
    members.value = result.data.members;
    if (sync.value !== "ws") {
      sync.value = "poll";
    }
  }
}

function connectSocket(tripId: number) {
  const token = getToken();
  if (!token) {
    sync.value = "poll";
    return;
  }
  socket = connectLocationSocket(getWsUrl(token), {
    onOpen() {
      socket?.send({ type: "subscribe", tripId });
    },
    onMessage: onSocketMessage,
    onClose() {
      if (active) {
        sync.value = "poll";
      }
    },
    onError() {
      if (active) {
        sync.value = "poll";
      }
    },
  });
}

function onSocketMessage(message: WsServerMessage) {
  if (message.type === "ready") {
    return;
  }
  if (message.type === "snapshot") {
    snapshot.value = message.data;
    members.value = message.data.members;
    sync.value = "ws";
    return;
  }
  if (message.type === "location") {
    upsertMember(message.point);
    sync.value = "ws";
    return;
  }
  if (message.type === "error") {
    sync.value = "poll";
  }
}

function upsertMember(point: LocationPoint) {
  const next = members.value.filter((item) => item.userId !== point.userId);
  next.push(point);
  members.value = next;
}

async function publishLocation() {
  const current = snapshot.value;
  if (!current || !active) {
    return;
  }
  const result = await locateDevice();
  if (result.location) {
    locateStatus.value = "gps";
    lastFix = { lng: result.location.lng, lat: result.location.lat };
  } else if (locateStatus.value === "idle") {
    locateStatus.value = result.status;
  }
  const origin = current.nodes.find((item) => item.lng != null && item.lat != null);
  if (!lastFix && origin) {
    lastFix = { lng: origin.lng as number, lat: origin.lat as number };
  }
  if (!lastFix) {
    return;
  }
  const shifted = offsetLngLat(lastFix.lng, lastFix.lat, east.value, north.value);
  const reported = await reportLocation(current.tripId, {
    lng: shifted.lng,
    lat: shifted.lat,
    speed: result.location?.speed ?? null,
    heading: result.location?.heading ?? null,
    accuracy: result.location?.accuracy ?? null,
  });
  if (reported.code === ErrorCode.OK && reported.data) {
    upsertMember(reported.data);
  }
}
</script>

<style scoped>
.map-page,
.map-page__stage,
.map-page__empty {
  height: calc(100vh - var(--window-bottom, 50px) - var(--window-top, 44px));
}

.map-page__stage {
  position: relative;
}

.map-page__hud {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  top: 24rpx;
  z-index: 2;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.94);
  pointer-events: none;
}

.map-page__hud :deep(button),
.map-page__hud :deep(.wd-tag) {
  pointer-events: auto;
}

.map-page__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.map-page__name {
  font-size: 32rpx;
  font-weight: 600;
  color: #111827;
}

.map-page__route,
.map-page__chip,
.map-page__hint {
  color: #4b5563;
  font-size: 24rpx;
}

.map-page__hint {
  display: block;
  margin-top: 8rpx;
  line-height: 1.5;
}

.map-page__people {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 12rpx;
}

.map-page__chip {
  background: #eef3f8;
  border-radius: 999rpx;
  padding: 6rpx 14rpx;
}

.map-page__pad {
  position: absolute;
  right: 24rpx;
  bottom: 24rpx;
  width: 280rpx;
  padding: 16rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.96);
  z-index: 3;
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.12);
}

.map-page__pad-title {
  display: block;
  margin-bottom: 8rpx;
  font-size: 20rpx;
  color: #6b7280;
}

.map-page__pad-row {
  display: flex;
  justify-content: center;
  gap: 8rpx;
  margin-top: 8rpx;
}
</style>
