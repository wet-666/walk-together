<template>
  <view v-if="copy" class="copy">
    <text class="copy__lead">个人副本基于主行程复制。你可以增减途经点，不影响全队主路线。导航路线默认不共享。</text>
    <view class="copy__card">
      <text v-for="node in copy.nodes" :key="node.id" class="copy__node">
        {{ label(node.kind) }} {{ node.name }}
      </text>
    </view>
    <view class="copy__card">
      <text class="copy__h">途经点（最多 5 个）</text>
      <view v-for="(point, index) in waypoints" :key="index" class="copy__way">
        <wd-input v-model="point.name" :placeholder="`途经点 ${index + 1}`" />
        <wd-button size="small" type="error" plain @click="waypoints.splice(index, 1)">删</wd-button>
      </view>
      <wd-button v-if="waypoints.length < 5" plain block @click="waypoints.push({ name: '' })">添加途经点</wd-button>
    </view>
    <view class="copy__check" @click="visibility = visibility === 'public' ? 'private' : 'public'">
      <wd-checkbox :model-value="visibility === 'public'" />
      <text>{{ visibility === "public" ? "公开给全队看" : "仅自己可见" }}</text>
    </view>
    <wd-button type="primary" block :loading="saving" @click="save">保存副本</wd-button>
  </view>
  <view v-else class="copy__lead">{{ hint }}</view>
</template>

<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { ErrorCode, type CopyVisibilityValue, type TripCopy } from "@walk-together/shared-types";
import { ref } from "vue";
import { getTripCopy, updateTripCopy } from "../../api/trip";

const copy = ref<TripCopy | null>(null);
const waypoints = ref<Array<{ name: string }>>([]);
const visibility = ref<CopyVisibilityValue>("private");
const saving = ref(false);
const hint = ref("加载中…");
const tripId = ref(0);

onLoad((query) => {
  tripId.value = Number(query?.id || 0);
  void load();
});

async function load() {
  const result = await getTripCopy(tripId.value);
  if (result.code !== ErrorCode.OK || !result.data) {
    hint.value = result.message || "还没有个人副本";
    return;
  }
  copy.value = result.data;
  visibility.value = result.data.visibility;
  waypoints.value = result.data.nodes
    .filter((item) => item.kind === "waypoint")
    .map((item) => ({ name: item.name }));
}

async function save() {
  saving.value = true;
  const result = await updateTripCopy(tripId.value, {
    visibility: visibility.value,
    waypoints: waypoints.value
      .map((item) => ({ name: item.name.trim() }))
      .filter((item) => item.name.length >= 2),
  });
  saving.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    copy.value = result.data;
    uni.showToast({ title: "已保存", icon: "none" });
  }
}

function label(kind: string): string {
  if (kind === "origin") return "起点";
  if (kind === "dest") return "终点";
  return "途经";
}
</script>

<style scoped>
.copy {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.copy__lead,
.copy__node {
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.6;
}

.copy__card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.copy__h {
  font-weight: 600;
}

.copy__way,
.copy__check {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.copy__way :deep(.wd-input) {
  flex: 1;
}
</style>
