<template>
  <view class="map-page">
    <view v-if="snapshot" class="map-page__stage">
      <TeamMap
        v-if="mapAlive"
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

      <view class="map-page__locate">
        <wd-button size="small" @click="askLocate">重新定位</wd-button>
      </view>
    </view>

    <view v-else-if="plazaMarks.length" class="map-page__stage">
      <PickMap :markers="plazaMarks" :center="here" @select="onPlazaSelect" />
      <view class="map-page__hud">
        <view class="map-page__title">
          <text class="map-page__name">招募中的车队</text>
        </view>
        <text class="map-page__hint">点标记看详情。加入后，这里会变成队友实时位置。</text>
      </view>
      <view class="map-page__locate">
        <wd-button size="small" @click="goTrip">列表查看</wd-button>
      </view>
    </view>

    <view v-else-if="!loggedIn" class="map-page__empty">
      <EmptyState
        title="登录后才能看见队友"
        description="组队之后就能在这儿看到队友。"
        action-text="去登录"
        extra-action-text="去行程广场"
        @action="goLogin"
        @extra="goTrip"
      />
    </view>

    <view v-else class="map-page__empty">
      <EmptyState
        title="加入行程后这里会出现地图"
        description="先发一条行程，或者去广场加入别人的队。"
        action-text="发布行程"
        extra-action-text="去行程广场加入"
        @action="goPublish"
        @extra="goTrip"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { onHide, onShow } from "@dcloudio/uni-app";
import {
  ErrorCode,
  type LocationPoint,
  type TripMapSnapshot,
  type TripSummary,
  type WsServerMessage,
} from "@walk-together/shared-types";
import { computed, ref } from "vue";
import { getActiveMap, getTripMap, getWsUrl, reportLocation } from "../../api/location";
import { listPlaza } from "../../api/trip";
import EmptyState from "../../components/EmptyState.vue";
import PickMap from "../../components/PickMap.vue";
import TeamMap from "../../components/TeamMap.vue";
import { locateDevice } from "../../native/geolocation";
import { connectLocationSocket, type LocationSocket } from "../../native/location-socket";
import { ensureLogin, getProfile, getToken, isLoggedIn } from "../../store/session";

const loggedIn = ref(false);
const snapshot = ref<TripMapSnapshot | null>(null);
const members = ref<LocationPoint[]>([]);
const plazaItems = ref<TripSummary[]>([]);
const here = ref<{ lng: number; lat: number } | null>(null);
const mapEngine = ref<"amap" | "photo" | "schematic" | "native">("schematic");
const sync = ref<"ws" | "poll" | "offline">("offline");
const locateStatus = ref<"gps" | "denied" | "unavailable" | "timeout" | "idle">("idle");
const mapAlive = ref(false);
const selfUserId = computed(() => getProfile()?.id ?? null);

const locateHint = computed(() => {
  if (locateStatus.value === "gps") {
    return "已用手机定位";
  }
  if (locateStatus.value === "denied") {
    return "定位被拒绝。请在系统或浏览器里允许定位，再点「重新定位」。";
  }
  return "暂时没拿到定位。手机请打开定位权限；电脑浏览器通常没有 GPS，点会停在起点附近。";
});

const mapHint = computed(() => {
  if (mapEngine.value === "amap" || mapEngine.value === "native") {
    return "可以拖动缩放。点「回到我」看自己的位置。";
  }
  if (mapEngine.value === "photo") {
    return "现在是静态底图，拖不动。";
  }
  return "现在是示意图，位置同步不受影响。";
});

function onMapEngine(value: "amap" | "photo" | "schematic" | "native") {
  mapEngine.value = value;
}

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

const plazaMarks = computed(() =>
  plazaItems.value.flatMap((item) => {
    const point =
      item.originLng != null && item.originLat != null
        ? { lng: item.originLng, lat: item.originLat }
        : item.destLng != null && item.destLat != null
          ? { lng: item.destLng, lat: item.destLat }
          : null;
    if (!point) {
      return [];
    }
    return [{ id: String(item.id), lng: point.lng, lat: point.lat, title: item.title }];
  }),
);

let reportTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let socket: LocationSocket | null = null;
let active = false;
let lastFix: { lng: number; lat: number } | null = null;

onShow(() => {
  loggedIn.value = isLoggedIn();
  mapAlive.value = true;
  if (!loggedIn.value) {
    stop();
    snapshot.value = null;
    void loadPlaza();
    return;
  }
  void start();
});

onHide(() => {
  mapAlive.value = false;
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

function onPlazaSelect(id: string) {
  uni.navigateTo({ url: `/pages/trip/detail?id=${id}` });
}

async function askLocate() {
  const result = await locateDevice();
  locateStatus.value = result.status;
  if (result.location) {
    lastFix = result.location;
    void publishLocation();
    uni.showToast({ title: "已更新定位", icon: "none" });
    return;
  }
  uni.showToast({ title: "还是没拿到定位", icon: "none" });
}

async function start() {
  stop();
  active = true;
  const loaded = await loadSnapshot();
  if (!loaded || !active) {
    await loadPlaza();
    return;
  }
  plazaItems.value = [];
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

async function loadPlaza() {
  const located = await locateDevice();
  if (located.location) {
    here.value = located.location;
    lastFix = located.location;
  }
  const result = await listPlaza({
    lng: here.value?.lng,
    lat: here.value?.lat,
    sort: here.value ? "distance" : "time",
  });
  plazaItems.value = result.code === ErrorCode.OK ? result.data ?? [] : [];
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
  const reported = await reportLocation(current.tripId, {
    lng: lastFix.lng,
    lat: lastFix.lat,
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

.map-page__locate {
  position: absolute;
  right: 24rpx;
  bottom: 24rpx;
  z-index: 3;
}
</style>
