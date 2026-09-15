<template>
  <EmptyState
    title="还没有会话"
    description="加入车队后，群聊会出现在这里。位置同步走自己的通道，不走聊天。"
    action-text="去看看行程"
    @action="goTrip"
  />
</template>

<script setup lang="ts">
import EmptyState from "../../components/EmptyState.vue";

function goTrip() {
  uni.switchTab({ url: "/pages/trip/index" });
}
</script>
