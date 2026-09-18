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
      "同路行会用到账号、位置和行程信息，方便组队。位置默认只在车队里共享。";
    return;
  }
  uni.setNavigationBarTitle({ title: "用户协议" });
  body.value =
    "用手机号或微信注册，注意出行安全，别拿队伍位置去骚扰别人。";
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
