<template>
  <view class="team-map">
    <!-- #ifdef MP-WEIXIN || APP-PLUS -->
    <map
      class="team-map__native"
      :latitude="viewLat"
      :longitude="viewLng"
      :scale="viewScale"
      :markers="nativeMarkers"
      :polyline="nativeLines"
      :include-points="includePoints"
      :enable-scroll="true"
      :enable-zoom="true"
      show-location
      @regionchange="onNativeRegion"
    />
    <!-- #endif -->

    <!-- #ifdef H5 -->
    <div
      v-show="engine === 'amap'"
      :id="canvasId"
      ref="mapHost"
      class="team-map__amap"
    ></div>
    <view v-show="engine !== 'amap'" class="team-map__board">
      <image v-if="photoUrl" class="team-map__photo" :src="photoUrl" mode="aspectFit" />
      <svg class="team-map__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <path
          v-if="svgPath && !photoUrl"
          :d="svgPath"
          fill="none"
          :stroke="routeColor"
          stroke-width="1.6"
          :stroke-dasharray="dashed ? '3 2' : undefined"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <g v-for="node in nodeMarks" :key="node.key">
          <circle :cx="node.x" :cy="node.y" r="1.8" :fill="node.fill" />
          <text :x="node.x" :y="node.y + 5" text-anchor="middle" class="team-map__label">
            {{ node.label }}
          </text>
        </g>
        <g v-for="mark in peopleMarks" :key="mark.key">
          <circle :cx="mark.x" :cy="mark.y" :r="mark.self ? 3.4 : 2.6" :fill="mark.fill" />
          <text :x="mark.x" :y="mark.y - 5" text-anchor="middle" class="team-map__label">
            {{ mark.label }}
          </text>
        </g>
      </svg>
      <text v-if="!hasGeometry" class="team-map__empty">还没有可画的坐标，队友上报后会出现点</text>
      <text v-if="fallbackHint" class="team-map__fallback">{{ fallbackHint }}</text>
    </view>
    <!-- #endif -->
    <view v-if="engine === 'amap' || engine === 'native'" class="team-map__tools">
      <text class="team-map__tool" @click="focusSelf">回到我</text>
      <text class="team-map__tool" @click="focusRoute">看全程</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { GeoLngLat, LocationPoint, TripMapSnapshot } from "@walk-together/shared-types";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchTripBasemap } from "../api/location";
import { getAmapJsKey, loadAmapJs, type AmapJsApi, type AmapMap, type AmapOverlay } from "../native/amap";

const props = defineProps<{
  snapshot: TripMapSnapshot | null;
  members: LocationPoint[];
  selfUserId: number | null;
}>();

const emit = defineEmits<{
  engine: [value: "amap" | "photo" | "schematic" | "native"];
}>();

const canvasId = `amap-${Math.random().toString(36).slice(2, 8)}`;
const mapHost = ref<HTMLElement | null>(null);
const engine = ref<"amap" | "photo" | "schematic" | "native">("schematic");
const photoUrl = ref("");
const fallbackHint = ref("");
const viewLat = ref(30.67);
const viewLng = ref(104.06);
const viewScale = ref(15);
const includePoints = ref<Array<{ latitude: number; longitude: number }>>([]);
let photoTimer: ReturnType<typeof setTimeout> | null = null;
let mapApi: AmapJsApi | null = null;
let map: AmapMap | null = null;
let overlays: AmapOverlay[] = [];
let cameraReady = false;

const routeColor = "#1D4F91";
const dashed = computed(() => props.snapshot?.status === "recruiting");

const geometry = computed(() => {
  const points: Array<{ lng: number; lat: number; kind: string; label: string; self?: boolean }> = [];
  for (const node of props.snapshot?.nodes ?? []) {
    if (node.lng == null || node.lat == null) {
      continue;
    }
    points.push({
      lng: node.lng,
      lat: node.lat,
      kind: node.kind,
      label: node.kind === "origin" ? "起点" : node.kind === "dest" ? "终点" : node.name,
    });
  }
  for (const item of props.snapshot?.polyline ?? []) {
    points.push({ lng: item.lng, lat: item.lat, kind: "line", label: "" });
  }
  for (const member of props.members) {
    points.push({
      lng: member.lng,
      lat: member.lat,
      kind: "person",
      label: member.userId === props.selfUserId ? "我" : member.nickname.slice(0, 4),
      self: member.userId === props.selfUserId,
    });
  }
  return points;
});

const hasGeometry = computed(() => geometry.value.length > 0);

const bounds = computed(() => {
  const pts = geometry.value;
  if (!pts.length) {
    return { minLng: 104, maxLng: 105, minLat: 30, maxLat: 31 };
  }
  const lngs = pts.map((item) => item.lng);
  const lats = pts.map((item) => item.lat);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  if (minLng === maxLng) {
    minLng -= 0.02;
    maxLng += 0.02;
  }
  if (minLat === maxLat) {
    minLat -= 0.02;
    maxLat += 0.02;
  }
  const padLng = (maxLng - minLng) * 0.12;
  const padLat = (maxLat - minLat) * 0.12;
  return {
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
  };
});

function project(lng: number, lat: number) {
  const box = bounds.value;
  const x = ((lng - box.minLng) / (box.maxLng - box.minLng)) * 100;
  const y = (1 - (lat - box.minLat) / (box.maxLat - box.minLat)) * 100;
  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

const nodeLine = computed(() =>
  (props.snapshot?.nodes ?? []).filter((item) => item.lng != null && item.lat != null) as GeoLngLat[],
);

const svgPath = computed(() => {
  const line = (props.snapshot?.polyline.length ? props.snapshot.polyline : nodeLine.value) as GeoLngLat[];
  if (line.length < 2) {
    return "";
  }
  return line
    .map((item, index) => {
      const point = project(item.lng, item.lat);
      return `${index === 0 ? "M" : "L"}${point.x} ${point.y}`;
    })
    .join(" ");
});

const nodeMarks = computed(() =>
  (props.snapshot?.nodes ?? [])
    .filter((item) => item.lng != null && item.lat != null)
    .map((item) => {
      const point = project(item.lng as number, item.lat as number);
      return {
        key: `n-${item.id}`,
        ...point,
        label: item.kind === "dest" ? "终点" : item.kind === "origin" ? "起点" : item.name.slice(0, 4),
        fill: item.kind === "dest" ? "#16a34a" : item.kind === "origin" ? "#6b7280" : "#93c5fd",
      };
    }),
);

const peopleMarks = computed(() =>
  props.members.map((item) => {
    const point = project(item.lng, item.lat);
    const self = item.userId === props.selfUserId;
    return {
      key: `p-${item.userId}`,
      ...point,
      self,
      label: self ? "我" : item.nickname.slice(0, 4),
      fill: self ? "#2563eb" : item.role === "captain" ? "#d97706" : "#1d4f91",
    };
  }),
);

const centerLat = computed(() => {
  const self = props.members.find((item) => item.userId === props.selfUserId);
  return self?.lat ?? props.snapshot?.nodes.find((item) => item.lat != null)?.lat ?? 30.67;
});
const centerLng = computed(() => {
  const self = props.members.find((item) => item.userId === props.selfUserId);
  return self?.lng ?? props.snapshot?.nodes.find((item) => item.lng != null)?.lng ?? 104.06;
});

const nativeMarkers = computed(() => {
  const people = props.members.map((item, index) => ({
    id: index + 1,
    latitude: item.lat,
    longitude: item.lng,
    title: item.userId === props.selfUserId ? "我" : item.nickname,
    width: 24,
    height: 24,
    callout: {
      content: item.userId === props.selfUserId ? "我" : item.nickname,
      display: "ALWAYS" as const,
      padding: 6,
      borderRadius: 8,
    },
  }));
  const nodes = (props.snapshot?.nodes ?? [])
    .filter((item) => item.lng != null && item.lat != null)
    .map((item, index) => ({
      id: 1000 + index,
      latitude: item.lat as number,
      longitude: item.lng as number,
      title: item.kind === "origin" ? "起点" : item.kind === "dest" ? "终点" : item.name,
      width: 18,
      height: 18,
      callout: {
        content: item.kind === "origin" ? "起点" : item.kind === "dest" ? "终点" : item.name,
        display: "ALWAYS" as const,
        padding: 6,
        borderRadius: 8,
      },
    }));
  return [...nodes, ...people];
});

const nativeLines = computed(() => {
  const line = props.snapshot?.polyline.length ? props.snapshot.polyline : nodeLine.value;
  if (line.length < 2) {
    return [];
  }
  return [
    {
      points: line.map((item) => ({ latitude: item.lat, longitude: item.lng })),
      color: "#1D4F91",
      width: 6,
      dottedLine: dashed.value,
    },
  ];
});

function resolveHost(): HTMLElement | null {
  const raw = mapHost.value as unknown;
  if (raw instanceof HTMLElement) {
    return raw;
  }
  if (raw && typeof raw === "object" && "$el" in raw) {
    const el = (raw as { $el?: unknown }).$el;
    if (el instanceof HTMLElement) {
      return el;
    }
  }
  return document.getElementById(canvasId);
}

function streetCenter(): [number, number] {
  return [centerLng.value, centerLat.value];
}

async function setupAmap() {
  if (!getAmapJsKey()) {
    fallbackHint.value = "当前是示意图。配上高德 JS Key 后就能拖动查看路名和街区。";
    await loadPhoto();
    return;
  }
  fallbackHint.value = "正在加载高德底图…";
  engine.value = "amap";
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  mapApi = await loadAmapJs();
  const host = resolveHost();
  if (!mapApi || !host) {
    fallbackHint.value = "高德底图没加载成功，先用示意图。检查 JS Key、安全密钥和域名白名单。";
    await loadPhoto();
    return;
  }
  map = new mapApi.Map(host, {
    zoom: 15,
    center: streetCenter(),
    viewMode: "2D",
    dragEnable: true,
    zoomEnable: true,
    doubleClickZoom: true,
    scrollWheel: true,
    showLabel: true,
  });
  try {
    mapApi.plugin?.(["AMap.Scale", "AMap.ToolBar"], () => {
      if (!map || !mapApi) {
        return;
      }
      if (mapApi.Scale) {
        map.addControl(new mapApi.Scale({ position: "LB" }));
      }
      if (mapApi.ToolBar) {
        map.addControl(new mapApi.ToolBar({ position: "LT" }));
      }
    });
  } catch {
    // 控件失败不影响底图拖动和路名
  }
  map.on("complete", () => {
    redrawAmap();
    if (!cameraReady) {
      focusSelf();
      cameraReady = true;
    }
  });
  redrawAmap();
  window.setTimeout(() => {
    if (!cameraReady && map) {
      focusSelf();
      cameraReady = true;
    }
  }, 800);
}

async function loadPhoto() {
  const tripId = props.snapshot?.tripId;
  if (!tripId) {
    engine.value = "schematic";
    return;
  }
  const next = await fetchTripBasemap(tripId);
  if (!next) {
    if (!photoUrl.value) {
      engine.value = "schematic";
    }
    return;
  }
  if (photoUrl.value) {
    URL.revokeObjectURL(photoUrl.value);
  }
  photoUrl.value = next;
  engine.value = "photo";
  fallbackHint.value = "当前是静态底图，不能拖动。配上 JS Key 后可查看街区。";
}

function queuePhoto() {
  if (engine.value === "amap") {
    return;
  }
  if (photoTimer) {
    clearTimeout(photoTimer);
  }
  photoTimer = setTimeout(() => {
    void loadPhoto();
  }, 700);
}

function redrawAmap() {
  if (!map || !mapApi) {
    return;
  }
  overlays.forEach((item) => item.setMap(null));
  overlays = [];
  const line = (props.snapshot?.polyline.length ? props.snapshot.polyline : nodeLine.value).map(
    (item) => [item.lng, item.lat] as [number, number],
  );
  if (line.length >= 2) {
    const poly = new mapApi.Polyline({
      path: line,
      strokeColor: routeColor,
      strokeWeight: 6,
      strokeStyle: dashed.value ? "dashed" : "solid",
      lineJoin: "round",
      lineCap: "round",
    });
    poly.setMap(map);
    overlays.push(poly);
  }
  for (const node of props.snapshot?.nodes ?? []) {
    if (node.lng == null || node.lat == null) {
      continue;
    }
    const marker = new mapApi.Marker({
      position: [node.lng, node.lat],
      title: node.name,
      zIndex: 110,
      label: {
        content: node.kind === "dest" ? "终点" : node.kind === "origin" ? "起点" : node.name.slice(0, 6),
        direction: "bottom",
      },
    });
    marker.setMap(map);
    overlays.push(marker);
  }
  for (const member of props.members) {
    const marker = new mapApi.Marker({
      position: [member.lng, member.lat],
      title: member.nickname,
      zIndex: 120,
      label: {
        content: member.userId === props.selfUserId ? "我" : member.nickname.slice(0, 4),
        direction: "top",
      },
    });
    marker.setMap(map);
    overlays.push(marker);
  }
}

function focusSelf() {
  includePoints.value = [];
  viewLat.value = centerLat.value;
  viewLng.value = centerLng.value;
  viewScale.value = 15;
  map?.setZoomAndCenter(15, streetCenter(), false);
}

function focusRoute() {
  const line = props.snapshot?.polyline.length ? props.snapshot.polyline : nodeLine.value;
  const points = [
    ...line.map((item) => ({ latitude: item.lat, longitude: item.lng })),
    ...props.members.map((item) => ({ latitude: item.lat, longitude: item.lng })),
  ];
  includePoints.value = points;
  if (map && overlays.length) {
    map.setFitView(overlays, false, [72, 48, 140, 48]);
  }
}

function onNativeRegion(event: { detail?: { type?: string; causedBy?: string } }) {
  if (event.detail?.type === "end" && event.detail.causedBy === "gesture") {
    includePoints.value = [];
  }
}

watch(engine, (value) => emit("engine", value), { immediate: true });

watch(
  () => [props.members, props.snapshot],
  () => {
    if (engine.value === "amap") {
      redrawAmap();
    }
  },
  { deep: true },
);

watch(
  () => `${props.snapshot?.tripId}:${props.snapshot?.polyline.length}`,
  () => {
    if (engine.value !== "amap") {
      queuePhoto();
    }
  },
);

watch(
  [centerLat, centerLng],
  ([lat, lng]) => {
    if (!cameraReady && Number.isFinite(lat) && Number.isFinite(lng)) {
      viewLat.value = lat;
      viewLng.value = lng;
    }
  },
  { immediate: true },
);

onMounted(() => {
  // #ifdef H5
  void setupAmap();
  // #endif
  // #ifdef MP-WEIXIN || APP-PLUS
  engine.value = "native";
  viewLat.value = centerLat.value;
  viewLng.value = centerLng.value;
  cameraReady = true;
  // #endif
});

onBeforeUnmount(() => {
  if (photoTimer) {
    clearTimeout(photoTimer);
  }
  if (photoUrl.value) {
    URL.revokeObjectURL(photoUrl.value);
  }
  overlays.forEach((item) => item.setMap(null));
  overlays = [];
  map?.destroy();
  map = null;
});

defineExpose({ focusSelf, focusRoute });
</script>

<style scoped>
.team-map,
.team-map__amap,
.team-map__native,
.team-map__board {
  width: 100%;
  height: 100%;
}

.team-map {
  position: relative;
  background: #d7e3ef;
}

.team-map__amap {
  touch-action: none;
}

.team-map__board {
  background: #d7e3ef;
  position: relative;
  overflow: hidden;
}

.team-map__photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.team-map__svg {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
}

.team-map__label {
  font-size: 3px;
  fill: #111827;
}

.team-map__empty,
.team-map__fallback {
  position: absolute;
  left: 32rpx;
  right: 32rpx;
  color: #4b5563;
  font-size: 22rpx;
  text-align: center;
}

.team-map__empty {
  bottom: 32rpx;
}

.team-map__fallback {
  bottom: 88rpx;
  padding: 12rpx 16rpx;
  border-radius: 12rpx;
  background: rgba(255, 255, 255, 0.92);
}

.team-map__tools {
  position: absolute;
  left: 24rpx;
  bottom: 24rpx;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.team-map__tool {
  padding: 12rpx 20rpx;
  border-radius: 12rpx;
  background: rgba(255, 255, 255, 0.96);
  color: #1d4f91;
  font-size: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.12);
}
</style>
