<template>
  <view class="about">
    <wd-cell-group border>
      <wd-cell title="关于同路行" value="组队出行工具" />
      <wd-cell title="版本" value="0.1.0-m1" />
      <wd-cell title="用户协议" is-link @click="open('user')" />
      <wd-cell title="隐私政策" is-link @click="open('privacy')" />
    </wd-cell-group>
  </view>
</template>

<script setup lang="ts">
function open(type: "user" | "privacy") {
  uni.navigateTo({ url: `/pages/mine/agreement?type=${type}` });
}
</script>

<style scoped>
.about {
  padding: 24rpx 0;
}
</style>
