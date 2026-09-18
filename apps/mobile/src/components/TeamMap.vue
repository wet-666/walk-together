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
      @updated="onNativeUpdated"
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
import {
  getAmapJsKey,
  loadAmapJs,
  type AmapDrivingResult,
  type AmapJsApi,
  type AmapLngLat,
  type AmapMap,
  type AmapOverlay,
} from "../native/amap";

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
let routeOverlay: AmapOverlay | null = null;
let nodeOverlays: AmapOverlay[] = [];
const peopleOverlays = new Map<number, AmapOverlay>();
let drivingTripId: number | null = null;
let cameraReady = false;
let instanceAlive = true;
let resizeObserver: ResizeObserver | null = null;
let onWindowResize: (() => void) | null = null;
const resizeTimers: ReturnType<typeof setTimeout>[] = [];

const routeColor = "#1D4F91";
const dashed = computed(() => props.snapshot?.status === "recruiting");
const localRoutePath = ref<GeoLngLat[] | null>(null);

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
  for (const item of routePoints.value) {
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
  const all = geometry.value;
  const routePts = all.filter((item) => item.kind !== "person");
  const pts = routePts.length ? routePts : all;
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

function asLngLat(item: { lng: number; lat: number }): GeoLngLat | null {
  const lng = Number(item.lng);
  const lat = Number(item.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  return { lng, lat };
}

const nodeLine = computed(() =>
  (props.snapshot?.nodes ?? [])
    .filter((item) => item.lng != null && item.lat != null)
    .map((item) => asLngLat({ lng: item.lng as number, lat: item.lat as number }))
    .filter((item): item is GeoLngLat => item !== null),
);

const routePoints = computed(() => {
  const raw = localRoutePath.value?.length
    ? localRoutePath.value
    : props.snapshot?.polyline?.length
      ? props.snapshot.polyline
      : nodeLine.value;
  return raw.map((item) => asLngLat(item)).filter((item): item is GeoLngLat => item !== null);
});

const svgPath = computed(() => {
  const line = routePoints.value;
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
  const route = routePoints.value;
  if (route.length) {
    return route.reduce((sum, item) => sum + item.lat, 0) / route.length;
  }
  const self = props.members.find((item) => item.userId === props.selfUserId);
  return self?.lat ?? 30.67;
});
const centerLng = computed(() => {
  const route = routePoints.value;
  if (route.length) {
    return route.reduce((sum, item) => sum + item.lng, 0) / route.length;
  }
  const self = props.members.find((item) => item.userId === props.selfUserId);
  return self?.lng ?? 104.06;
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
  const line = routePoints.value;
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

function routeScale(): number {
  const pts = routePoints.value;
  if (pts.length < 2) {
    return 12;
  }
  const span = Math.max(
    Math.max(...pts.map((item) => item.lng)) - Math.min(...pts.map((item) => item.lng)),
    Math.max(...pts.map((item) => item.lat)) - Math.min(...pts.map((item) => item.lat)),
  );
  if (span > 8) return 5;
  if (span > 4) return 6;
  if (span > 2) return 7;
  if (span > 1) return 8;
  if (span > 0.4) return 9;
  if (span > 0.15) return 11;
  if (span > 0.05) return 13;
  return 15;
}

function tripIncludePoints() {
  const line = routePoints.value;
  const step = line.length > 24 ? Math.ceil(line.length / 24) : 1;
  const sampled = line.filter((_, index) => index % step === 0 || index === line.length - 1);
  const points = [
    ...sampled.map((item) => ({ latitude: item.lat, longitude: item.lng })),
    ...(props.snapshot?.nodes ?? [])
      .filter((item) => item.lng != null && item.lat != null)
      .map((item) => ({ latitude: item.lat as number, longitude: item.lng as number })),
  ];
  const seen = new Set<string>();
  return points.filter((item) => {
    const key = `${item.latitude.toFixed(5)},${item.longitude.toFixed(5)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function hostHasSize(host: HTMLElement) {
  const rect = host.getBoundingClientRect();
  return (host.clientWidth || rect.width) > 8 && (host.clientHeight || rect.height) > 8;
}

async function waitForHostSize(host: HTMLElement) {
  for (let i = 0; i < 25; i++) {
    if (hostHasSize(host)) {
      return true;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 40);
    });
  }
  return hostHasSize(host);
}

function bumpMapSize() {
  try {
    map?.resize?.();
  } catch {
    // 隐藏后再显示时容器尺寸可能还没稳定
  }
}

function clearResizeHooks() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (onWindowResize) {
    window.removeEventListener("resize", onWindowResize);
    onWindowResize = null;
  }
  resizeTimers.forEach((timer) => clearTimeout(timer));
  resizeTimers.length = 0;
}

function hookResize(host: HTMLElement) {
  clearResizeHooks();
  onWindowResize = bumpMapSize;
  window.addEventListener("resize", bumpMapSize);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => bumpMapSize());
    resizeObserver.observe(host);
  }
  for (const ms of [80, 240, 640]) {
    resizeTimers.push(window.setTimeout(bumpMapSize, ms));
  }
}

function attachOverlay(overlay: AmapOverlay) {
  if (!map) {
    return;
  }
  try {
    if (typeof map.add === "function") {
      map.add(overlay);
      return;
    }
  } catch {
    // 2.0 add 失败时退回 1.x setMap
  }
  overlay.setMap(map);
}

function detachOverlay(overlay: AmapOverlay | null) {
  if (!overlay) {
    return;
  }
  try {
    if (map && typeof map.remove === "function") {
      map.remove(overlay);
      return;
    }
  } catch {
    // ignore
  }
  overlay.setMap(null);
}

function clearRouteOverlays() {
  detachOverlay(routeOverlay);
  routeOverlay = null;
  nodeOverlays.forEach((item) => detachOverlay(item));
  nodeOverlays = [];
}

function clearPeopleOverlays() {
  peopleOverlays.forEach((item) => detachOverlay(item));
  peopleOverlays.clear();
}

function teardownAmap() {
  clearResizeHooks();
  clearRouteOverlays();
  clearPeopleOverlays();
  try {
    map?.destroy();
  } catch {
    // 切页销毁失败不影响下次重建
  }
  map = null;
  cameraReady = false;
}

async function setupAmap() {
  if (!getAmapJsKey()) {
    fallbackHint.value = "暂时用示意图，位置还是会同步。";
    await loadPhoto();
    return;
  }
  fallbackHint.value = "正在加载地图…";
  engine.value = "amap";
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  mapApi = await loadAmapJs();
  if (!instanceAlive) {
    return;
  }
  const host = resolveHost();
  if (!mapApi || !host) {
    fallbackHint.value = "地图没加载出来，先用示意图。";
    await loadPhoto();
    return;
  }
  await waitForHostSize(host);
  if (!instanceAlive) {
    return;
  }
  teardownAmap();
  if (!instanceAlive) {
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
  hookResize(host);
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
    if (!instanceAlive || !map) {
      return;
    }
    bumpMapSize();
    redrawAmap();
    if (!cameraReady) {
      fitTripCamera();
      cameraReady = true;
    }
  });
  redrawAmap();
  resizeTimers.push(
    window.setTimeout(() => {
      if (!instanceAlive || !map || cameraReady) {
        return;
      }
      fitTripCamera();
      cameraReady = true;
    }, 800),
  );
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
  fallbackHint.value = "这是静态底图，拖不动。";
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

function readDrivingPoint(
  point: AmapLngLat | [number, number] | { lng: number; lat: number },
): [number, number] | null {
  if (Array.isArray(point) && point.length >= 2) {
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }
  if (point && typeof point === "object") {
    if ("getLng" in point && "getLat" in point) {
      const lng = Number(point.getLng());
      const lat = Number(point.getLat());
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    }
    if ("lng" in point && "lat" in point) {
      const lng = Number(point.lng);
      const lat = Number(point.lat);
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    }
  }
  return null;
}

function drivingPath(result: AmapDrivingResult): GeoLngLat[] {
  const path = (result.routes?.[0]?.steps ?? [])
    .flatMap((step) => step.path ?? [])
    .map(readDrivingPoint)
    .filter((item): item is [number, number] => item !== null)
    .map(([lng, lat]) => ({ lng, lat }));
  if (path.length <= 24) {
    return path;
  }
  const step = Math.ceil(path.length / 200);
  const sampled = path.filter((_, index) => index % step === 0);
  const last = path[path.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

function upgradeDrivingRoute() {
  const tripId = props.snapshot?.tripId;
  const nodes = nodeLine.value;
  if (!mapApi || !tripId || nodes.length < 2) {
    return;
  }
  if (drivingTripId === tripId && (localRoutePath.value?.length ?? 0) >= 8) {
    return;
  }
  if ((props.snapshot?.polyline?.length ?? 0) >= 8) {
    return;
  }
  const origin: [number, number] = [nodes[0].lng, nodes[0].lat];
  const destination: [number, number] = [nodes[nodes.length - 1].lng, nodes[nodes.length - 1].lat];
  const waypoints = nodes.slice(1, -1).map((item) => [item.lng, item.lat] as [number, number]);
  const apply = (api: AmapJsApi) => {
    if (!instanceAlive || !api.Driving || drivingTripId === tripId) {
      return;
    }
    drivingTripId = tripId;
    const driving = new api.Driving({ hideMarkers: true, autoFitView: false });
    driving.search(origin, destination, { waypoints }, (status, result) => {
      if (!instanceAlive || status !== "complete") {
        return;
      }
      const path = drivingPath(result);
      if (path.length < 2) {
        return;
      }
      localRoutePath.value = path;
      drawRouteLine();
      if (engine.value === "amap") {
        fitTripCamera();
      }
    });
  };
  if (mapApi.Driving) {
    apply(mapApi);
    return;
  }
  try {
    mapApi.plugin?.("AMap.Driving", () => {
      if (mapApi) {
        apply(mapApi);
      }
    });
  } catch {
    // 浏览器侧路径规划失败时仍保留起终点直线
  }
}

function drawRouteLine() {
  if (!map || !mapApi) {
    return;
  }
  const line = routePoints.value.map((item) => [item.lng, item.lat] as [number, number]);
  detachOverlay(routeOverlay);
  routeOverlay = null;
  if (line.length < 2) {
    return;
  }
  const poly = new mapApi.Polyline({
    path: line,
    strokeColor: routeColor,
    strokeOpacity: 1,
    strokeWeight: 8,
    strokeStyle: dashed.value ? "dashed" : "solid",
    strokeDasharray: dashed.value ? [8, 4] : undefined,
    lineJoin: "round",
    lineCap: "round",
    zIndex: 50,
    showDir: true,
  });
  attachOverlay(poly);
  routeOverlay = poly;
}

function drawNodeMarkers() {
  if (!map || !mapApi) {
    return;
  }
  nodeOverlays.forEach((item) => detachOverlay(item));
  nodeOverlays = [];
  for (const node of props.snapshot?.nodes ?? []) {
    if (node.lng == null || node.lat == null) {
      continue;
    }
    const marker = new mapApi.Marker({
      position: [Number(node.lng), Number(node.lat)],
      title: node.name,
      zIndex: 110,
      label: {
        content: node.kind === "dest" ? "终点" : node.kind === "origin" ? "起点" : node.name.slice(0, 6),
        direction: "bottom",
      },
    });
    attachOverlay(marker);
    nodeOverlays.push(marker);
  }
}

function syncPeopleMarkers() {
  if (!map || !mapApi) {
    return;
  }
  const seen = new Set<number>();
  for (const member of props.members) {
    seen.add(member.userId);
    const existing = peopleOverlays.get(member.userId);
    if (existing?.setPosition) {
      existing.setPosition([member.lng, member.lat]);
      continue;
    }
    detachOverlay(existing ?? null);
    const marker = new mapApi.Marker({
      position: [member.lng, member.lat],
      title: member.nickname,
      zIndex: 120,
      label: {
        content: member.userId === props.selfUserId ? "我" : member.nickname.slice(0, 4),
        direction: "top",
      },
    });
    attachOverlay(marker);
    peopleOverlays.set(member.userId, marker);
  }
  for (const [userId, marker] of peopleOverlays) {
    if (seen.has(userId)) {
      continue;
    }
    detachOverlay(marker);
    peopleOverlays.delete(userId);
  }
}

function redrawAmap() {
  if (!map || !mapApi) {
    return;
  }
  drawRouteLine();
  drawNodeMarkers();
  syncPeopleMarkers();
  upgradeDrivingRoute();
}

function focusSelf() {
  const self = props.members.find((item) => item.userId === props.selfUserId);
  includePoints.value = [];
  viewLat.value = self?.lat ?? centerLat.value;
  viewLng.value = self?.lng ?? centerLng.value;
  viewScale.value = 15;
  map?.setZoomAndCenter(15, [viewLng.value, viewLat.value], false);
}

function fitTripCamera() {
  const points = tripIncludePoints();
  if (!points.length) {
    focusSelf();
    return;
  }
  if (points.length === 1) {
    includePoints.value = [];
    viewLat.value = points[0].latitude;
    viewLng.value = points[0].longitude;
    viewScale.value = 12;
    map?.setZoomAndCenter(12, [points[0].longitude, points[0].latitude], false);
    return;
  }
  viewLat.value = centerLat.value;
  viewLng.value = centerLng.value;
  viewScale.value = routeScale();
  includePoints.value = points;
  const routeLayer = [routeOverlay, ...nodeOverlays].filter((item): item is AmapOverlay => Boolean(item));
  if (map && routeLayer.length) {
    map.setFitView(routeLayer, false, [72, 48, 140, 48]);
  }
}

function focusRoute() {
  fitTripCamera();
}

function onNativeUpdated() {
  if (!cameraReady && routePoints.value.length) {
    fitTripCamera();
    cameraReady = true;
  }
}

function onNativeRegion(event: { detail?: { type?: string; causedBy?: string } }) {
  if (event.detail?.type === "end" && event.detail.causedBy === "gesture") {
    includePoints.value = [];
  }
}

watch(engine, (value) => emit("engine", value), { immediate: true });

watch(
  () => props.snapshot?.tripId,
  () => {
    localRoutePath.value = null;
    drivingTripId = null;
  },
);

watch(
  () => `${props.snapshot?.tripId}:${routePoints.value.length}:${props.snapshot?.polyline?.length ?? 0}:${props.snapshot?.status}`,
  () => {
    if (engine.value === "amap") {
      drawRouteLine();
      drawNodeMarkers();
      upgradeDrivingRoute();
    } else {
      queuePhoto();
    }
    cameraReady = false;
    void nextTick(() => {
      fitTripCamera();
      if (engine.value === "native" || engine.value === "amap") {
        cameraReady = true;
      }
    });
  },
);

watch(
  () => props.members.map((item) => `${item.userId}:${item.lng}:${item.lat}`).join("|"),
  () => {
    if (engine.value === "amap") {
      syncPeopleMarkers();
    }
  },
);

onMounted(() => {
  // #ifdef H5
  void setupAmap();
  // #endif
  // #ifdef MP-WEIXIN || APP-PLUS
  engine.value = "native";
  fitTripCamera();
  cameraReady = true;
  // #endif
});

onBeforeUnmount(() => {
  instanceAlive = false;
  if (photoTimer) {
    clearTimeout(photoTimer);
  }
  if (photoUrl.value) {
    URL.revokeObjectURL(photoUrl.value);
  }
  teardownAmap();
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
