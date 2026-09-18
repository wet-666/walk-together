<template>
  <view class="pick-map">
    <!-- #ifdef MP-WEIXIN || APP-PLUS -->
    <map
      class="pick-map__native"
      :latitude="viewLat"
      :longitude="viewLng"
      :scale="viewScale"
      :markers="nativeMarkers"
      :include-points="includePoints"
      :enable-scroll="true"
      :enable-zoom="true"
      show-location
      @tap="onNativeTap"
      @markertap="onNativeMarker"
    />
    <!-- #endif -->

    <!-- #ifdef H5 -->
    <div
      v-show="engine === 'amap'"
      :id="canvasId"
      ref="mapHost"
      class="pick-map__amap"
    ></div>
    <view v-show="engine !== 'amap'" class="pick-map__board" @click="onBoardClick">
      <svg class="pick-map__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <g v-for="mark in schematicMarks" :key="mark.id">
          <circle :cx="mark.x" :cy="mark.y" r="2.4" fill="#1d4f91" />
          <text :x="mark.x" :y="mark.y - 4" text-anchor="middle" class="pick-map__label">
            {{ mark.title }}
          </text>
        </g>
      </svg>
      <text class="pick-map__hint">{{ hint }}</text>
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getAmapJsKey, loadAmapJs, type AmapJsApi, type AmapMap, type AmapOverlay } from "../native/amap";

export type PickMapMarker = {
  id: string;
  lng: number;
  lat: number;
  title: string;
};

const props = defineProps<{
  markers: PickMapMarker[];
  pickable?: boolean;
  center?: { lng: number; lat: number } | null;
}>();

const emit = defineEmits<{
  pick: [point: { lng: number; lat: number }];
  select: [id: string];
}>();

const canvasId = `pick-${Math.random().toString(36).slice(2, 8)}`;
const mapHost = ref<HTMLElement | null>(null);
const engine = ref<"amap" | "schematic" | "native">("schematic");
const viewLat = ref(props.center?.lat ?? 30.67);
const viewLng = ref(props.center?.lng ?? 104.06);
const viewScale = ref(11);
const hint = ref("可以搜地点，也可以手填。");
let mapApi: AmapJsApi | null = null;
let map: AmapMap | null = null;
let overlays: AmapOverlay[] = [];
let instanceAlive = true;
let lastMarkerAt = 0;

const includePoints = computed(() =>
  props.markers.map((item) => ({ latitude: item.lat, longitude: item.lng })),
);

const nativeMarkers = computed(() =>
  props.markers.map((item, index) => ({
    id: index + 1,
    latitude: item.lat,
    longitude: item.lng,
    title: item.title,
    width: 24,
    height: 24,
    callout: {
      content: item.title,
      display: "ALWAYS" as const,
      padding: 6,
      borderRadius: 8,
    },
  })),
);

const bounds = computed(() => {
  const pts = props.markers;
  if (!pts.length) {
    const lng = props.center?.lng ?? 104.06;
    const lat = props.center?.lat ?? 30.67;
    return { minLng: lng - 0.08, maxLng: lng + 0.08, minLat: lat - 0.06, maxLat: lat + 0.06 };
  }
  const lngs = pts.map((item) => item.lng);
  const lats = pts.map((item) => item.lat);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  if (minLng === maxLng) {
    minLng -= 0.04;
    maxLng += 0.04;
  }
  if (minLat === maxLat) {
    minLat -= 0.03;
    maxLat += 0.03;
  }
  return { minLng, maxLng, minLat, maxLat };
});

const schematicMarks = computed(() => {
  const box = bounds.value;
  const spanLng = box.maxLng - box.minLng || 1;
  const spanLat = box.maxLat - box.minLat || 1;
  return props.markers.map((item) => ({
    id: item.id,
    title: item.title.slice(0, 6),
    x: Number((((item.lng - box.minLng) / spanLng) * 80 + 10).toFixed(2)),
    y: Number(((1 - (item.lat - box.minLat) / spanLat) * 80 + 10).toFixed(2)),
  }));
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
  return typeof document === "undefined" ? null : document.getElementById(canvasId);
}

function teardown() {
  overlays.forEach((item) => item.setMap(null));
  overlays = [];
  try {
    map?.destroy();
  } catch {
    // ignore
  }
  map = null;
}

function redraw() {
  if (!map || !mapApi) {
    return;
  }
  overlays.forEach((item) => item.setMap(null));
  overlays = [];
  for (const item of props.markers) {
    const marker = new mapApi.Marker({
      position: [item.lng, item.lat],
      title: item.title,
      zIndex: 120,
      label: { content: item.title.slice(0, 8), direction: "top" },
    });
    marker.on?.("click", () => {
      lastMarkerAt = Date.now();
      emit("select", item.id);
    });
    marker.setMap(map);
    overlays.push(marker);
  }
  if (overlays.length) {
    map.setFitView(overlays, false, [48, 48, 48, 48]);
  } else if (props.center) {
    map.setZoomAndCenter(13, [props.center.lng, props.center.lat], false);
  }
}

async function setupAmap() {
  if (!getAmapJsKey()) {
    engine.value = "schematic";
    hint.value = props.pickable
      ? "搜地点或手填也能发车。"
      : "地图暂时用示意图。";
    return;
  }
  engine.value = "amap";
  await nextTick();
  mapApi = await loadAmapJs();
  const host = resolveHost();
  if (!instanceAlive || !mapApi || !host) {
    engine.value = "schematic";
    hint.value = "地图没加载出来，先搜索或手填。";
    return;
  }
  teardown();
  const center = props.center ?? props.markers[0] ?? { lng: 104.06, lat: 30.67 };
  map = new mapApi.Map(host, {
    zoom: 12,
    center: [center.lng, center.lat],
    viewMode: "2D",
    dragEnable: true,
    zoomEnable: true,
    doubleClickZoom: true,
    scrollWheel: true,
    showLabel: true,
  });
  map.on("complete", () => {
    map?.resize?.();
    redraw();
  });
  if (props.pickable) {
    map.on("click", (event) => {
      if (Date.now() - lastMarkerAt < 300) {
        return;
      }
      const lng = event?.lnglat?.getLng();
      const lat = event?.lnglat?.getLat();
      if (lng == null || lat == null) {
        return;
      }
      emit("pick", { lng, lat });
    });
  }
  redraw();
}

function onNativeTap(event: { detail?: { longitude?: number; latitude?: number } }) {
  if (!props.pickable || Date.now() - lastMarkerAt < 300) {
    return;
  }
  const lng = event.detail?.longitude;
  const lat = event.detail?.latitude;
  if (lng == null || lat == null) {
    return;
  }
  emit("pick", { lng, lat });
}

function onNativeMarker(event: { detail?: { markerId?: number } }) {
  lastMarkerAt = Date.now();
  const index = Number(event.detail?.markerId ?? 0) - 1;
  const mark = props.markers[index];
  if (mark) {
    emit("select", mark.id);
  }
}

function onBoardClick() {
  if (props.pickable) {
    hint.value = "这张图点不了，搜一下或手填。";
  }
}

function syncCamera() {
  const focus = props.center ?? props.markers[0];
  if (!focus) {
    return;
  }
  viewLat.value = focus.lat;
  viewLng.value = focus.lng;
  viewScale.value = props.markers.length > 1 ? 8 : 13;
}

watch(
  () => props.markers,
  () => {
    syncCamera();
    redraw();
  },
  { deep: true },
);

watch(
  () => props.center,
  () => {
    syncCamera();
    if (props.center && !props.markers.length) {
      map?.setZoomAndCenter(13, [props.center.lng, props.center.lat], false);
    }
  },
);

onMounted(() => {
  instanceAlive = true;
  // #ifdef MP-WEIXIN || APP-PLUS
  engine.value = "native";
  syncCamera();
  // #endif
  // #ifdef H5
  void setupAmap();
  // #endif
});

onBeforeUnmount(() => {
  instanceAlive = false;
  teardown();
});
</script>

<style scoped>
.pick-map,
.pick-map__native,
.pick-map__amap,
.pick-map__board {
  width: 100%;
  height: 100%;
  min-height: 280rpx;
}

.pick-map {
  overflow: hidden;
  border-radius: 16rpx;
  background: #e8eef5;
}

.pick-map__board {
  position: relative;
}

.pick-map__svg {
  width: 100%;
  height: 100%;
}

.pick-map__label,
.pick-map__hint {
  font-size: 22rpx;
  fill: #4b5563;
  color: #4b5563;
}

.pick-map__hint {
  position: absolute;
  left: 16rpx;
  right: 16rpx;
  bottom: 16rpx;
  line-height: 1.4;
}
</style>
