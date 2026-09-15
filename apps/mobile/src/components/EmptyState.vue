<template>
  <view class="empty">
    <wd-status-tip image="content" :tip="title" />
    <text class="empty__desc">{{ description }}</text>
    <wd-button
      v-if="actionText"
      type="primary"
      block
      custom-class="empty__btn"
      @click="emit('action')"
    >
      {{ actionText }}
    </wd-button>
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
  padding: 48rpx 64rpx 80rpx;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.empty__desc {
  margin-top: -12rpx;
  font-size: 28rpx;
  line-height: 1.6;
  color: #6b7280;
}

.empty__btn {
  margin-top: 40rpx;
}
</style>
