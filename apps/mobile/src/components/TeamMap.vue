<template>
  <view class="team-map">
    <!-- #ifdef MP-WEIXIN || APP-PLUS -->
    <map
      class="team-map__native"
      :latitude="centerLat"
      :longitude="centerLng"
      :markers="nativeMarkers"
      :polyline="nativeLines"
      :scale="12"
      show-location
    />
    <!-- #endif -->

    <!-- #ifdef H5 -->
    <view v-show="engine === 'amap'" :id="canvasId" class="team-map__amap"></view>
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
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import type { GeoLngLat, LocationPoint, TripMapSnapshot } from "@walk-together/shared-types";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchTripBasemap } from "../api/location";
import { getAmapJsKey, loadAmapJs, type AmapJsApi } from "../native/amap";

const props = defineProps<{
  snapshot: TripMapSnapshot | null;
  members: LocationPoint[];
  selfUserId: number | null;
}>();

const canvasId = `amap-${Math.random().toString(36).slice(2, 8)}`;
const engine = ref<"amap" | "photo" | "schematic" | "native">("schematic");
const photoUrl = ref("");
let photoTimer: ReturnType<typeof setTimeout> | null = null;
let mapApi: AmapJsApi | null = null;
let map: { setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void; destroy: () => void } | null = null;
let overlays: Array<{ setMap: (value: null) => void }> = [];

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

const nodeLine = computed(() =>
  (props.snapshot?.nodes ?? []).filter((item) => item.lng != null && item.lat != null) as GeoLngLat[],
);

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

const nativeMarkers = computed(() =>
  props.members.map((item, index) => ({
    id: index + 1,
    latitude: item.lat,
    longitude: item.lng,
    title: item.userId === props.selfUserId ? "我" : item.nickname,
    width: 24,
    height: 24,
    callout: {
      content: item.userId === props.selfUserId ? "我" : item.nickname,
      display: "ALWAYS",
      padding: 6,
      borderRadius: 8,
    },
  })),
);

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

async function setupAmap() {
  if (getAmapJsKey()) {
    mapApi = await loadAmapJs();
    if (mapApi) {
      engine.value = "amap";
      map = new mapApi.Map(canvasId, {
        zoom: 11,
        center: [centerLng.value, centerLat.value],
        viewMode: "2D",
      });
      redrawAmap();
      return;
    }
  }
  await loadPhoto();
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
    });
    poly.setMap(map);
    overlays.push(poly);
  }
  for (const member of props.members) {
    const marker = new mapApi.Marker({
      position: [member.lng, member.lat],
      title: member.nickname,
      label: {
        content: member.userId === props.selfUserId ? "我" : member.nickname.slice(0, 4),
        direction: "top",
      },
    });
    marker.setMap(map);
    overlays.push(marker);
  }
  map.setFitView(overlays, false, [48, 48, 160, 48]);
}

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

onMounted(() => {
  // #ifdef H5
  void setupAmap();
  // #endif
  // #ifdef MP-WEIXIN || APP-PLUS
  engine.value = "native";
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
  background: #d7e3ef;
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

.team-map__svg {
  width: 100%;
  height: 100%;
}

.team-map__label {
  font-size: 3px;
  fill: #111827;
}

.team-map__empty {
  position: absolute;
  left: 32rpx;
  right: 32rpx;
  bottom: 32rpx;
  color: #6b7280;
  font-size: 24rpx;
  text-align: center;
}
</style>
