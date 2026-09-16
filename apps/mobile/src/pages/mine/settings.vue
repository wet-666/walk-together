<template>
  <view class="about">
    <wd-cell-group border>
      <wd-cell title="编辑资料" is-link @click="goProfile" />
      <wd-cell title="绑定手机号" is-link @click="goBindPhone" />
      <wd-cell title="关于同路行" value="组队出行工具" />
      <wd-cell title="版本" value="0.1.0-m1" />
      <wd-cell title="用户协议" is-link @click="open('user')" />
      <wd-cell title="隐私政策" is-link @click="open('privacy')" />
    </wd-cell-group>

    <view v-if="loggedIn" class="about__danger">
      <wd-button type="error" plain block :loading="cancelling" @click="onCancel">
        注销账号
      </wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ErrorCode } from "@walk-together/shared-types";
import { ref } from "vue";
import { cancelAccount } from "../../api/auth";
import { clearSession, isLoggedIn } from "../../store/session";

const loggedIn = ref(false);
const cancelling = ref(false);

onShow(() => {
  loggedIn.value = isLoggedIn();
});

function open(type: "user" | "privacy") {
  uni.navigateTo({ url: `/pages/mine/agreement?type=${type}` });
}

function goProfile() {
  if (!ensureAuthed()) {
    return;
  }
  uni.navigateTo({ url: "/pages/mine/profile" });
}

function goBindPhone() {
  if (!ensureAuthed()) {
    return;
  }
  uni.navigateTo({ url: "/pages/mine/bind-phone" });
}

function ensureAuthed(): boolean {
  if (isLoggedIn()) {
    return true;
  }
  uni.navigateTo({ url: "/pages/auth/login" });
  return false;
}

function onCancel() {
  if (!ensureAuthed() || cancelling.value) {
    return;
  }
  uni.showModal({
    title: "注销账号",
    content: "注销后无法用同一微信或手机号登录该账号，且不可恢复。确定注销？",
    confirmColor: "#e11d48",
    success: (res) => {
      if (res.confirm) {
        void doCancel();
      }
    },
  });
}

async function doCancel() {
  cancelling.value = true;
  const result = await cancelAccount();
  cancelling.value = false;
  if (result.code === ErrorCode.OK) {
    clearSession();
    loggedIn.value = false;
    uni.showToast({ title: "账号已注销", icon: "none" });
    setTimeout(() => {
      uni.switchTab({ url: "/pages/mine/index" });
    }, 400);
  }
}
</script>

<style scoped>
.about {
  padding: 24rpx 0;
}

.about__danger {
  padding: 48rpx 40rpx 0;
}
</style>
