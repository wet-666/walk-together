<template>
  <view class="publish">
    <view class="publish__steps">
      <text
        v-for="item in steps"
        :key="item.n"
        class="publish__step"
        :class="{ 'publish__step--on': step === item.n }"
      >
        {{ item.n }}.{{ item.label }}
      </text>
    </view>

    <view v-if="step === 1" class="publish__panel">
      <text class="publish__lead">搜索或点地图选起点、终点。电脑没有定位就手填地名，例如「成都」「康定」。</text>
      <view class="publish__chips">
        <text
          class="publish__chip"
          :class="{ 'publish__chip--on': picking === 'origin' }"
          @click="picking = 'origin'"
        >
          选起点
        </text>
        <text
          class="publish__chip"
          :class="{ 'publish__chip--on': picking === 'dest' }"
          @click="picking = 'dest'"
        >
          选终点
        </text>
        <text
          v-if="waypoints.length"
          class="publish__chip"
          :class="{ 'publish__chip--on': picking === 'way' }"
          @click="picking = 'way'"
        >
          选途经
        </text>
      </view>
      <wd-input
        v-model="originName"
        placeholder="起点，可搜索"
        :maxlength="64"
        clearable
        @focus="picking = 'origin'"
        @input="onPlaceInput('origin')"
        @confirm="searchNow('origin')"
      />
      <view v-if="picking === 'origin' && originTips.length" class="publish__tips">
        <text
          v-for="tip in originTips"
          :key="`${tip.name}-${tip.lng}`"
          class="publish__tip"
          @click="applyPlace('origin', tip)"
        >
          {{ tip.name }} {{ tip.district }}
        </text>
      </view>
      <wd-button size="small" plain @click="useHere">用当前位置作起点</wd-button>
      <wd-input
        v-model="destName"
        placeholder="终点，可搜索"
        :maxlength="64"
        clearable
        @focus="picking = 'dest'"
        @input="onPlaceInput('dest')"
        @confirm="searchNow('dest')"
      />
      <view v-if="picking === 'dest' && destTips.length" class="publish__tips">
        <text
          v-for="tip in destTips"
          :key="`${tip.name}-${tip.lng}`"
          class="publish__tip"
          @click="applyPlace('dest', tip)"
        >
          {{ tip.name }} {{ tip.district }}
        </text>
      </view>
      <view v-for="(point, index) in waypoints" :key="index" class="publish__way">
        <wd-input
          v-model="point.name"
          :placeholder="`途经点 ${index + 1}`"
          :maxlength="64"
          @focus="focusWay(index)"
        />
        <wd-button size="small" type="error" plain @click="removeWay(index)">删</wd-button>
      </view>
      <wd-button v-if="waypoints.length < 5" plain block @click="addWay">添加途经点</wd-button>
      <view class="publish__map">
        <PickMap
          :markers="routeMarks"
          :center="mapCenter"
          pickable
          @pick="onMapPick"
        />
      </view>
    </view>

    <view v-else-if="step === 2" class="publish__panel">
      <wd-input v-model="title" placeholder="行程标题" :maxlength="40" clearable />
      <view class="publish__row">
        <picker mode="date" :value="departDate" @change="onDate">
          <view class="publish__picker">出发日期 {{ departDate || "请选择" }}</view>
        </picker>
        <picker mode="time" :value="departTime" @change="onTime">
          <view class="publish__picker">时间 {{ departTime }}</view>
        </picker>
      </view>
      <wd-input v-model="estimatedDays" type="number" placeholder="预计天数（1–30）" />
      <wd-input v-model="dailyMileage" type="number" placeholder="每日里程公里（选填）" />
      <text class="publish__label">同路深度</text>
      <view class="publish__chips">
        <text
          v-for="item in depths"
          :key="item.value"
          class="publish__chip"
          :class="{ 'publish__chip--on': companionDepth === item.value }"
          @click="companionDepth = item.value"
        >
          {{ item.label }}
        </text>
      </view>
      <text class="publish__label">沿途打算</text>
      <view class="publish__chips">
        <text
          v-for="item in plans"
          :key="item.value"
          class="publish__chip"
          :class="{ 'publish__chip--on': alongPlans.includes(item.value) }"
          @click="togglePlan(item.value)"
        >
          {{ item.label }}
        </text>
      </view>
      <wd-input v-model="maxVehicles" type="number" placeholder="车队人数上限（1–20 辆）" />
      <text class="publish__label">隐私</text>
      <view class="publish__chips">
        <text
          class="publish__chip"
          :class="{ 'publish__chip--on': privacy === 'public' }"
          @click="privacy = 'public'"
        >
          公开
        </text>
        <text
          class="publish__chip"
          :class="{ 'publish__chip--on': privacy === 'invite' }"
          @click="privacy = 'invite'"
        >
          仅邀请码
        </text>
      </view>
      <view class="publish__check" @click="allowCopy = !allowCopy">
        <wd-checkbox :model-value="allowCopy" />
        <text>允许队员建个人副本</text>
      </view>
      <wd-input v-model="feeNote" placeholder="费用说明（选填）" :maxlength="120" />
      <wd-input v-model="tagText" placeholder="标签，逗号分隔，最多 5 个" />
      <wd-button plain block @click="pickCover">{{ coverPath ? "已选封面，点击更换" : "选择封面（选填）" }}</wd-button>
      <image v-if="coverPath" class="publish__cover" mode="aspectFill" :src="coverPath" />
    </view>

    <view v-else class="publish__panel">
      <text class="publish__lead">确认后发布。发布后会生成邀请码，另一人申请、你审批即可成队。</text>
      <image v-if="coverPath" class="publish__cover" mode="aspectFill" :src="coverPath" />
      <text v-else class="publish__lead">未选择封面</text>
      <view class="publish__preview">
        <text class="publish__title">{{ title }}</text>
        <text>{{ originName }} → {{ destName }}</text>
        <text v-if="waypoints.some((item) => item.name.trim())">
          途经 {{ waypoints.filter((item) => item.name.trim()).map((item) => item.name).join("、") }}
        </text>
        <text>{{ departDate }} {{ departTime }} · {{ estimatedDays || 1 }} 天 · 最多 {{ maxVehicles || 5 }} 辆</text>
        <text>{{ privacy === "public" ? "公开招募" : "仅邀请码加入" }}</text>
      </view>
    </view>

    <view class="publish__actions">
      <wd-button v-if="step > 1" plain @click="step -= 1">上一步</wd-button>
      <wd-button v-if="step < 3" type="primary" @click="next">下一步</wd-button>
      <wd-button v-else type="primary" :loading="submitting" @click="submit">确认发布</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import {
  ErrorCode,
  type AlongPlanValue,
  type CompanionDepthValue,
  type PlaceSuggestion,
  type TripPlaceInput,
  type TripPrivacyValue,
} from "@walk-together/shared-types";
import { computed, ref } from "vue";
import { createTrip, reversePlace, searchPlaces, uploadCover } from "../../api/trip";
import PickMap from "../../components/PickMap.vue";
import { locateDevice } from "../../native/geolocation";

const steps = [
  { n: 1, label: "画路线" },
  { n: 2, label: "行程详情" },
  { n: 3, label: "确认发布" },
];

const step = ref(1);
const originName = ref("");
const originLng = ref<number | null>(null);
const originLat = ref<number | null>(null);
const destName = ref("");
const destLng = ref<number | null>(null);
const destLat = ref<number | null>(null);
const waypoints = ref<Array<{ name: string; lng?: number | null; lat?: number | null }>>([]);
const picking = ref<"origin" | "dest" | "way">("origin");
const wayIndex = ref(0);
const originTips = ref<PlaceSuggestion[]>([]);
const destTips = ref<PlaceSuggestion[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
const title = ref("");
const departDate = ref("");
const departTime = ref("08:00");
const estimatedDays = ref("1");
const dailyMileage = ref("");
const companionDepth = ref<CompanionDepthValue>("medium");
const alongPlans = ref<AlongPlanValue[]>([]);
const maxVehicles = ref("5");
const privacy = ref<TripPrivacyValue>("public");
const allowCopy = ref(true);
const feeNote = ref("");
const tagText = ref("");
const coverPath = ref("");
const submitting = ref(false);

const depths: Array<{ value: CompanionDepthValue; label: string }> = [
  { value: "shallow", label: "浅" },
  { value: "medium", label: "中" },
  { value: "deep", label: "深" },
];
const plans: Array<{ value: AlongPlanValue; label: string }> = [
  { value: "aa", label: "AA" },
  { value: "dining", label: "拼桌" },
  { value: "sightseeing", label: "同逛" },
  { value: "help", label: "互助" },
];

const routeMarks = computed(() => {
  const marks: Array<{ id: string; lng: number; lat: number; title: string }> = [];
  if (originLng.value != null && originLat.value != null) {
    marks.push({ id: "origin", lng: originLng.value, lat: originLat.value, title: originName.value || "起点" });
  }
  waypoints.value.forEach((item, index) => {
    if (item.lng != null && item.lat != null) {
      marks.push({
        id: `way-${index}`,
        lng: item.lng,
        lat: item.lat,
        title: item.name || `途经${index + 1}`,
      });
    }
  });
  if (destLng.value != null && destLat.value != null) {
    marks.push({ id: "dest", lng: destLng.value, lat: destLat.value, title: destName.value || "终点" });
  }
  return marks;
});

const mapCenter = computed(() => {
  if (originLng.value != null && originLat.value != null) {
    return { lng: originLng.value, lat: originLat.value };
  }
  return null;
});

onLoad(() => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  departDate.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  useHere();
});

function useHere() {
  void locateDevice().then((result) => {
    if (!result.location) {
      uni.showToast({ title: "未拿到定位，请手填起点", icon: "none" });
      return;
    }
    originLng.value = result.location.lng;
    originLat.value = result.location.lat;
    if (!originName.value) {
      originName.value = "当前位置";
    }
    uni.showToast({ title: "已填入当前位置", icon: "none" });
  });
}

function addWay() {
  waypoints.value.push({ name: "" });
  picking.value = "way";
  wayIndex.value = waypoints.value.length - 1;
}

function removeWay(index: number) {
  waypoints.value.splice(index, 1);
  if (!waypoints.value.length) {
    picking.value = "dest";
  }
}

function focusWay(index: number) {
  picking.value = "way";
  wayIndex.value = index;
}

function onPlaceInput(kind: "origin" | "dest") {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void searchNow(kind);
  }, 350);
}

async function searchNow(kind: "origin" | "dest") {
  const text = kind === "origin" ? originName.value.trim() : destName.value.trim();
  if (text.length < 2) {
    if (kind === "origin") {
      originTips.value = [];
    } else {
      destTips.value = [];
    }
    return;
  }
  const result = await searchPlaces(text);
  const tips = result.code === ErrorCode.OK ? result.data ?? [] : [];
  if (kind === "origin") {
    originTips.value = tips;
  } else {
    destTips.value = tips;
  }
}

function applyPlace(kind: "origin" | "dest", tip: PlaceSuggestion) {
  if (kind === "origin") {
    originName.value = tip.name;
    originLng.value = tip.lng;
    originLat.value = tip.lat;
    originTips.value = [];
  } else {
    destName.value = tip.name;
    destLng.value = tip.lng;
    destLat.value = tip.lat;
    destTips.value = [];
  }
}

async function onMapPick(point: { lng: number; lat: number }) {
  const result = await reversePlace(point.lng, point.lat);
  const place = result.data?.[0];
  const name = place?.name || "地图选点";
  if (picking.value === "origin") {
    originName.value = name;
    originLng.value = point.lng;
    originLat.value = point.lat;
    return;
  }
  if (picking.value === "dest") {
    destName.value = name;
    destLng.value = point.lng;
    destLat.value = point.lat;
    return;
  }
  const current = waypoints.value[wayIndex.value];
  if (current) {
    current.name = name;
    current.lng = point.lng;
    current.lat = point.lat;
  }
}

function togglePlan(value: AlongPlanValue) {
  if (alongPlans.value.includes(value)) {
    alongPlans.value = alongPlans.value.filter((item) => item !== value);
    return;
  }
  alongPlans.value = [...alongPlans.value, value];
}

function onDate(e: { detail: { value: string } }) {
  departDate.value = e.detail.value;
}

function onTime(e: { detail: { value: string } }) {
  departTime.value = e.detail.value;
}

function pickCover() {
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: (res) => {
      coverPath.value = res.tempFilePaths[0] || "";
    },
  });
}

function next() {
  if (step.value === 1) {
    if (originName.value.trim().length < 2 || destName.value.trim().length < 2) {
      uni.showToast({ title: "请填写起点和终点", icon: "none" });
      return;
    }
  }
  if (step.value === 2) {
    if (title.value.trim().length < 2) {
      uni.showToast({ title: "请填写行程标题", icon: "none" });
      return;
    }
    if (!departDate.value) {
      uni.showToast({ title: "请选择出发时间", icon: "none" });
      return;
    }
  }
  step.value += 1;
}

async function submit() {
  if (submitting.value) {
    return;
  }
  submitting.value = true;
  const waypointPlaces: TripPlaceInput[] = waypoints.value
    .map((item) => ({
      name: item.name.trim(),
      lng: item.lng,
      lat: item.lat,
    }))
    .filter((item) => item.name.length >= 2);
  const result = await createTrip({
    title: title.value.trim(),
    origin: {
      name: originName.value.trim(),
      lng: originLng.value,
      lat: originLat.value,
    },
    destination: {
      name: destName.value.trim(),
      lng: destLng.value,
      lat: destLat.value,
    },
    waypoints: waypointPlaces,
    departAt: `${departDate.value}T${departTime.value}:00+08:00`,
    estimatedDays: Number(estimatedDays.value || 1),
    dailyMileage: dailyMileage.value ? Number(dailyMileage.value) : null,
    companionDepth: companionDepth.value,
    alongPlans: alongPlans.value,
    maxVehicles: Number(maxVehicles.value || 5),
    privacy: privacy.value,
    allowCopy: allowCopy.value,
    feeNote: feeNote.value,
    tags: tagText.value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
  });
  if (result.code !== ErrorCode.OK || !result.data) {
    submitting.value = false;
    return;
  }
  if (coverPath.value) {
    const cover = await uploadCover(result.data.id, coverPath.value);
    if (cover.code !== ErrorCode.OK) {
      submitting.value = false;
      uni.redirectTo({ url: `/pages/trip/detail?id=${result.data.id}` });
      return;
    }
  }
  submitting.value = false;
  uni.showToast({ title: "已发布", icon: "none" });
  uni.redirectTo({ url: `/pages/trip/detail?id=${result.data.id}` });
}
</script>

<style scoped>
.publish {
  padding: 24rpx 24rpx 48rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.publish__steps {
  display: flex;
  justify-content: space-between;
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
}

.publish__step {
  font-size: 24rpx;
  color: #9ca3af;
}

.publish__step--on {
  color: #1d4f91;
  font-weight: 600;
}

.publish__panel,
.publish__preview {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.publish__lead,
.publish__label {
  font-size: 24rpx;
  color: #6b7280;
}

.publish__way,
.publish__row,
.publish__actions,
.publish__check {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.publish__way :deep(.wd-input),
.publish__row {
  flex: 1;
}

.publish__tips {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  background: #f4f6f8;
  border-radius: 12rpx;
  padding: 8rpx 12rpx;
}

.publish__tip {
  font-size: 24rpx;
  color: #1d4f91;
  padding: 8rpx 4rpx;
}

.publish__map {
  height: 360rpx;
}

.publish__picker {
  flex: 1;
  padding: 20rpx;
  background: #f4f6f8;
  border-radius: 12rpx;
  font-size: 26rpx;
}

.publish__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.publish__chip {
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background: #f4f6f8;
  color: #4b5563;
  font-size: 24rpx;
}

.publish__chip--on {
  background: #1d4f91;
  color: #fff;
}

.publish__title {
  font-size: 34rpx;
  font-weight: 600;
}

.publish__cover {
  width: 100%;
  height: 240rpx;
  border-radius: 12rpx;
  background: #e5e7eb;
}

.publish__actions {
  justify-content: flex-end;
}
</style>
