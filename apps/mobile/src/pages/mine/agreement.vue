<template>
  <view class="agreement">
    <text class="agreement__title">{{ title }}</text>
    <text class="agreement__body">{{ body }}</text>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { ref } from "vue";

const title = ref("用户协议");
const body = ref("");

onLoad((query) => {
  const type = String(query?.type || "user");
  if (type === "privacy") {
    title.value = "隐私政策";
    uni.setNavigationBarTitle({ title: "隐私政策" });
    body.value =
      "同路行会收集账号、位置和行程信息，用于组队出行。位置默认只在车队内共享，可在后续版本开启隐身。完整条款将在应用商店上架前由法务补全。";
    return;
  }
  uni.setNavigationBarTitle({ title: "用户协议" });
  body.value =
    "使用同路行即表示你同意：用微信或手机号创建账号，遵守出行安全，不把队伍位置用于骚扰。车主认证、拼团和支付会在后续版本接入。完整协议将在上架前补全。";
});
</script>

<style scoped>
.agreement {
  padding: 32rpx 40rpx 80rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.agreement__title {
  font-size: 36rpx;
  font-weight: 600;
  color: #111827;
}

.agreement__body {
  font-size: 28rpx;
  line-height: 1.7;
  color: #4b5563;
}
</style>
