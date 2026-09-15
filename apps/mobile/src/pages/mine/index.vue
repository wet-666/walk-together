<template>
  <view>
    <EmptyState
      title="登录后开始组队"
      description="支持微信一键登录和手机验证码。车主认证以后再补，现在先浏览。"
      action-text="登录"
      @action="goLogin"
    />
    <button class="link" hover-class="link--active" @click="goSettings">设置</button>
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
.link {
  margin: 0 64rpx 48rpx;
  padding: 0;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 28rpx;
  color: #1d4f91;
  background: transparent;
  text-align: left;
}

.link--active {
  opacity: 0.7;
}

.link::after {
  border: none;
}
</style>
