<template>
  <view class="about">
    <text class="about__title">关于同路行</text>
    <text class="about__desc">版本 0.1.0-m0 · 组队出行工具</text>
  </view>
</template>

<script setup lang="ts"></script>

<style scoped>
.about {
  padding: 80rpx 64rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.about__title {
  font-size: 40rpx;
  font-weight: 600;
  color: #1f2937;
}

.about__desc {
  font-size: 28rpx;
  color: #6b7280;
}
</style>
