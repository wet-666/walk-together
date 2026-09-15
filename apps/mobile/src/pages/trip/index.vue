<template>
  <EmptyState
    title="还没有行程"
    description="发布一条路线，邀请另一辆车加入。两人成队之后，地图和群聊才会有内容。"
    action-text="发布行程"
    @action="goPublish"
  />
</template>

<script setup lang="ts">
import EmptyState from "../../components/EmptyState.vue";

function goPublish() {
  uni.navigateTo({ url: "/pages/trip/publish" });
}
</script>
