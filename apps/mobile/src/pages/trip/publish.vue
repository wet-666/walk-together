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
      <text class="publish__lead">先填起点和终点，再点下一步。电脑没有定位就手填地名，例如「成都」「康定」。</text>
      <wd-input v-model="originName" placeholder="起点" :maxlength="64" clearable />
      <wd-button size="small" plain @click="useHere">用当前位置作起点</wd-button>
      <wd-input v-model="destName" placeholder="终点" :maxlength="64" clearable />
      <view v-for="(point, index) in waypoints" :key="index" class="publish__way">
        <wd-input v-model="point.name" :placeholder="`途经点 ${index + 1}`" :maxlength="64" />
        <wd-button size="small" type="error" plain @click="removeWay(index)">删</wd-button>
      </view>
      <wd-button v-if="waypoints.length < 5" plain block @click="addWay">添加途经点</wd-button>
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
    </view>

    <view v-else class="publish__panel">
      <text class="publish__lead">确认后发布。发布后会生成邀请码，另一人申请、你审批即可成队。</text>
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
  type TripPlaceInput,
  type TripPrivacyValue,
} from "@walk-together/shared-types";
import { ref } from "vue";
import { createTrip, uploadCover } from "../../api/trip";
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
const waypoints = ref<Array<{ name: string }>>([]);
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
}

function removeWay(index: number) {
  waypoints.value.splice(index, 1);
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
    .map((item) => ({ name: item.name.trim() }))
    .filter((item) => item.name.length >= 2);
  const result = await createTrip({
    title: title.value.trim(),
    origin: {
      name: originName.value.trim(),
      lng: originLng.value,
      lat: originLat.value,
    },
    destination: { name: destName.value.trim() },
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
    await uploadCover(result.data.id, coverPath.value);
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

.publish__actions {
  justify-content: flex-end;
}
</style>
