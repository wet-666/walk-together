<template>
  <view>
    <EmptyState
      title="地图上将显示你和队友"
      description="加入行程后，这里会出现本队路线和实时位置。现在还没有行程。"
      action-text="去发布行程"
      @action="goTrip"
    />
    <view class="health">
      <wd-tag :type="healthType" mark>{{ healthText }}</wd-tag>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import EmptyState from "../../components/EmptyState.vue";
import { getHealth } from "../../api/http";
import { ErrorCode } from "@walk-together/shared-types";

const healthText = ref("正在检查服务…");
const healthType = ref<"default" | "success" | "warning">("default");

onShow(() => {
  void refreshHealth();
});

function goTrip() {
  uni.switchTab({ url: "/pages/trip/index" });
}

async function refreshHealth() {
  const result = await getHealth();
  if (result.code === ErrorCode.OK && result.data) {
    healthType.value = "success";
    healthText.value = `服务已连接 · ${result.data.version}`;
    return;
  }
  healthType.value = "warning";
  healthText.value = result.message || "服务未就绪";
}
</script>

<style scoped>
.health {
  padding: 0 64rpx 48rpx;
}
</style>
