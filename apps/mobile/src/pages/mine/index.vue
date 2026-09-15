<template>
  <view>
    <EmptyState
      title="登录后开始组队"
      description="支持微信一键登录和手机验证码。车主认证以后再补，现在先浏览。"
      action-text="登录"
      @action="goLogin"
    />
    <view class="extra">
      <wd-button type="primary" plain @click="goSettings">设置</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import EmptyState from "../../components/EmptyState.vue";

function goLogin() {
  uni.navigateTo({ url: "/pages/auth/login" });
}

function goSettings() {
  uni.navigateTo({ url: "/pages/mine/settings" });
}
</script>

<style scoped>
.extra {
  padding: 0 48rpx 48rpx;
}
</style>
