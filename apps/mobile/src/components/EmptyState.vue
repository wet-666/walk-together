<template>
  <view class="empty">
    <text class="empty__title">{{ title }}</text>
    <text class="empty__desc">{{ description }}</text>
    <button
      v-if="actionText"
      class="empty__btn"
      hover-class="empty__btn--active"
      @click="emit('action')"
    >
      {{ actionText }}
    </button>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  actionText?: string;
}>();

const emit = defineEmits<{
  action: [];
}>();
</script>

<style scoped>
.empty {
  min-height: 70vh;
  padding: 80rpx 64rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 24rpx;
}

.empty__title {
  font-size: 40rpx;
  font-weight: 600;
  color: #1f2937;
}

.empty__desc {
  font-size: 28rpx;
  line-height: 1.6;
  color: #6b7280;
}

.empty__btn {
  margin-top: 24rpx;
  margin-left: 0;
  padding: 0 40rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  color: #ffffff;
  background: #1d4f91;
  border-radius: 8rpx;
}

.empty__btn--active {
  background: #163e73;
}

.empty__btn::after {
  border: none;
}
</style>
