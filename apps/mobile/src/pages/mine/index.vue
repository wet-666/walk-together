<template>
  <view v-if="profile" class="mine">
    <view class="mine__card" @click="goProfile">
      <wd-avatar :src="avatarSrc" :text="avatarText" size="large" />
      <view class="mine__meta">
        <text class="mine__name">{{ profile.nickname }}</text>
        <text class="mine__phone">{{ maskPhone(profile.phone) }}</text>
        <wd-tag custom-class="mine__tag" mark>{{ certLabel }}</wd-tag>
      </view>
    </view>

    <wd-cell-group border>
      <wd-cell title="编辑资料" is-link @click="goProfile" />
      <wd-cell
        :title="profile.phone ? '更换手机号' : '绑定手机号'"
        :value="profile.phone ? maskPhone(profile.phone) : '未绑定'"
        is-link
        @click="goBindPhone"
      />
      <wd-cell title="车主认证" :value="certLabel" is-link @click="toastLater('车主认证下一阶段开通，认证前可先浏览')" />
      <wd-cell title="我的行程" value="组队后出现" is-link @click="goTrip" />
      <wd-cell title="设置" is-link @click="goSettings" />
    </wd-cell-group>

    <view class="mine__logout">
      <wd-button type="error" plain block @click="onLogout">退出登录</wd-button>
    </view>
  </view>

  <view v-else>
    <EmptyState
      title="登录后开始组队"
      description="支持微信一键登录和手机验证码。车主认证以后再补，现在先浏览。"
      action-text="登录"
      @action="goLogin"
    />
    <view class="mine__extra">
      <wd-button type="primary" plain @click="goSettings">设置</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { CertStatus, ErrorCode } from "@walk-together/shared-types";
import { computed, ref } from "vue";
import type { UserProfile } from "@walk-together/shared-types";
import EmptyState from "../../components/EmptyState.vue";
import { getMe, logoutRequest } from "../../api/auth";
import { resolveMediaUrl } from "../../config/env";
import {
  clearSession,
  getProfile,
  isLoggedIn,
  maskPhone,
  setProfile,
} from "../../store/session";

const profile = ref<UserProfile | null>(null);

const avatarSrc = computed(() => resolveMediaUrl(profile.value?.avatarUrl));
const avatarText = computed(() => profile.value?.nickname?.slice(0, 1) || "同");
const certLabel = computed(() => {
  if (profile.value?.certStatus === CertStatus.APPROVED) {
    return "已认证";
  }
  if (profile.value?.certStatus === CertStatus.PENDING) {
    return "审核中";
  }
  return "未认证";
});

onShow(() => {
  void refresh();
});

async function refresh() {
  if (!isLoggedIn()) {
    profile.value = null;
    return;
  }
  profile.value = getProfile();
  const result = await getMe();
  if (result.code === ErrorCode.OK && result.data) {
    setProfile(result.data);
    profile.value = result.data;
    return;
  }
  if (
    result.code === ErrorCode.UNAUTHORIZED ||
    result.code === ErrorCode.ACCOUNT_DISABLED
  ) {
    clearSession();
    profile.value = null;
  }
}

function goLogin() {
  uni.navigateTo({ url: "/pages/auth/login" });
}

function goSettings() {
  uni.navigateTo({ url: "/pages/mine/settings" });
}

function goProfile() {
  uni.navigateTo({ url: "/pages/mine/profile" });
}

function goBindPhone() {
  uni.navigateTo({ url: "/pages/mine/bind-phone" });
}

function goTrip() {
  uni.switchTab({ url: "/pages/trip/index" });
}

function toastLater(title: string) {
  uni.showToast({ title, icon: "none" });
}

async function onLogout() {
  await logoutRequest();
  clearSession();
  profile.value = null;
  uni.showToast({ title: "已退出登录", icon: "none" });
}
</script>

<style scoped>
.mine {
  padding: 32rpx 0 48rpx;
}

.mine__card {
  margin: 0 24rpx 24rpx;
  padding: 32rpx;
  background: #fff;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.mine__meta {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.mine__name {
  font-size: 36rpx;
  font-weight: 600;
  color: #111827;
}

.mine__phone {
  font-size: 26rpx;
  color: #6b7280;
}

.mine__logout,
.mine__extra {
  padding: 32rpx 48rpx 0;
}
</style>
