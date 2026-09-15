<template>
  <EmptyState
    title="登录下一阶段接通"
    description="将支持微信授权和手机验证码。密钥申请可以现在做，接口下一阶段再写。"
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
