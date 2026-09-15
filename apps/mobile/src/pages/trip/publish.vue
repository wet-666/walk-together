<template>
  <EmptyState
    title="发布向导下一阶段开通"
    description="以后三步：画路线 → 填写出发时间和人数 → 确认发布。"
    action-text="返回"
    @action="goBack"
  />
</template>

<script setup lang="ts">
import EmptyState from "../../components/EmptyState.vue";

function goBack() {
  uni.navigateBack();
}
</script>
