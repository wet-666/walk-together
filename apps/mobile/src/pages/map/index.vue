<template>
  <view>
    <EmptyState
      title="地图上将显示你和队友"
      description="加入行程后，这里会出现本队路线和实时位置。现在还没有行程。"
      action-text="去发布行程"
      @action="goTrip"
    />
    <text class="health">{{ healthText }}</text>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import EmptyState from "../../components/EmptyState.vue";
import { getHealth } from "../../api/http";
import { ErrorCode } from "@walk-together/shared-types";

const healthText = ref("正在检查服务…");

onShow(() => {
  void refreshHealth();
});

function goTrip() {
  uni.switchTab({ url: "/pages/trip/index" });
}

async function refreshHealth() {
  const result = await getHealth();
  if (result.code === ErrorCode.OK && result.data) {
    healthText.value = `服务已连接 · MySQL ${result.data.mysql} · Redis ${result.data.redis}`;
    return;
  }
  healthText.value = result.message || "服务未就绪";
}
</script>

<style scoped>
.health {
  display: block;
  padding: 0 64rpx 48rpx;
  font-size: 22rpx;
  color: #9ca3af;
}
</style>
