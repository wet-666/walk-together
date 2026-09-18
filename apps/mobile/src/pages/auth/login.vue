<template>
  <view class="login">
    <view class="login__hero">
      <text class="login__name">同路行</text>
      <text class="login__lead">登录后就可以组队出发</text>
    </view>

    <!-- #ifdef MP-WEIXIN || APP-PLUS -->
    <wd-button type="primary" block :disabled="!agreed || submitting" @click="onWechatLogin">
      微信一键登录
    </wd-button>
    <view class="login__split">
      <text>或用手机号</text>
    </view>
    <!-- #endif -->

    <!-- #ifdef H5 -->
    <text class="login__hint">网页版用手机号登录</text>
    <!-- #endif -->

    <wd-input
      v-model="phone"
      type="number"
      placeholder="手机号"
      :maxlength="11"
      clearable
    />
    <view class="login__code">
      <wd-input
        v-model="code"
        type="number"
        placeholder="验证码"
        :maxlength="6"
        clearable
      />
      <wd-button size="small" plain :disabled="countdown > 0 || sending" @click="onSendSms">
        {{ countdown > 0 ? `${countdown}s` : "获取验证码" }}
      </wd-button>
    </view>

    <wd-button type="primary" block :loading="submitting" @click="onSmsLogin">
      登录
    </wd-button>

    <view class="login__agree">
      <wd-checkbox v-model="agreed" />
      <text class="login__agree-text">
        我已阅读并同意
        <text class="login__link" @click="openAgreement('user')">《用户协议》</text>
        和
        <text class="login__link" @click="openAgreement('privacy')">《隐私政策》</text>
      </text>
    </view>

    <text v-if="showDevHint" class="login__dev">开发环境验证码 123456</text>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onUnload } from "@dcloudio/uni-app";
import { ErrorCode, WechatClient, type UserProfile, type WechatClientValue } from "@walk-together/shared-types";
import { onUnmounted, ref } from "vue";
import { loginBySms, loginByWechat, sendSms } from "../../api/auth";
import { CN_MOBILE } from "../../config/env";
import { afterLoginRedirect, setSession } from "../../store/session";

const phone = ref("");
const code = ref("");
const agreed = ref(false);
const submitting = ref(false);
const sending = ref(false);
const countdown = ref(0);
const redirect = ref("");
const showDevHint = import.meta.env.DEV;
let timer: ReturnType<typeof setInterval> | null = null;

onLoad((query) => {
  const raw = query?.redirect;
  redirect.value = raw ? decodeURIComponent(String(raw)) : "";
});

onUnload(stopTimer);
onUnmounted(stopTimer);

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function startCountdown() {
  countdown.value = 60;
  stopTimer();
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      stopTimer();
    }
  }, 1000);
}

function assertAgreed(): boolean {
  if (agreed.value) {
    return true;
  }
  uni.showToast({ title: "请先阅读并同意用户协议和隐私政策", icon: "none" });
  return false;
}

function assertPhoneInput(): boolean {
  if (CN_MOBILE.test(phone.value.trim())) {
    return true;
  }
  uni.showToast({ title: "请输入 11 位手机号", icon: "none" });
  return false;
}

function openAgreement(type: "user" | "privacy") {
  uni.navigateTo({ url: `/pages/mine/agreement?type=${type}` });
}

function wechatClient(): WechatClientValue {
  // #ifdef APP-PLUS
  return WechatClient.APP;
  // #endif
  return WechatClient.MINI;
}

function onWechatFail(err?: { errMsg?: string }) {
  const msg = err?.errMsg || "";
  if (/cancel|取消/i.test(msg)) {
    uni.showToast({ title: "已取消微信登录", icon: "none" });
    return;
  }
  uni.showToast({ title: "微信登录暂不可用，请用手机号", icon: "none" });
}

async function onSendSms() {
  if (!assertAgreed() || sending.value || countdown.value > 0) {
    return;
  }
  if (!assertPhoneInput()) {
    return;
  }
  sending.value = true;
  const result = await sendSms({ phone: phone.value.trim() });
  sending.value = false;
  if (result.code === ErrorCode.OK) {
    startCountdown();
    uni.showToast({ title: "验证码已发送", icon: "none" });
  }
}

async function onSmsLogin() {
  if (!assertAgreed() || submitting.value) {
    return;
  }
  if (!assertPhoneInput()) {
    return;
  }
  if (!/^\d{6}$/.test(code.value.trim())) {
    uni.showToast({ title: "请输入 6 位验证码", icon: "none" });
    return;
  }
  submitting.value = true;
  const result = await loginBySms({ phone: phone.value.trim(), code: code.value.trim() });
  submitting.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    setSession(result.data);
    afterLoginRedirect(redirect.value);
  }
}

function onWechatLogin() {
  if (!assertAgreed() || submitting.value) {
    return;
  }

  // #ifdef MP-WEIXIN
  uni.getUserProfile({
    desc: "用于完善同路行资料",
    success: (info) => {
      uni.login({
        provider: "weixin",
        success: (res) => {
          void submitWechat(res.code, {
            nickname: info.userInfo.nickName,
            avatarUrl: info.userInfo.avatarUrl,
          });
        },
        fail: onWechatFail,
      });
    },
    fail: () => {
      uni.login({
        provider: "weixin",
        success: (res) => {
          void submitWechat(res.code);
        },
        fail: onWechatFail,
      });
    },
  });
  // #endif

  // #ifdef APP-PLUS
  uni.login({
    provider: "weixin",
    success: (res) => {
      uni.getUserInfo({
        provider: "weixin",
        success: (info) => {
          void submitWechat(res.code, {
            nickname: info.userInfo.nickName,
            avatarUrl: info.userInfo.avatarUrl,
          });
        },
        fail: () => {
          void submitWechat(res.code);
        },
      });
    },
    fail: onWechatFail,
  });
  // #endif
}

async function submitWechat(
  wxCode: string,
  extra?: { nickname?: string; avatarUrl?: string },
) {
  submitting.value = true;
  const result = await loginByWechat({
    code: wxCode,
    client: wechatClient(),
    nickname: extra?.nickname,
    avatarUrl: extra?.avatarUrl,
  });
  submitting.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    setSession(result.data);
    maybeCompleteWechatProfile(result.data.profile);
  }
}

function maybeCompleteWechatProfile(profile: UserProfile) {
  // #ifdef MP-WEIXIN
  const needProfile = /^同路人/.test(profile.nickname) || !profile.avatarUrl;
  if (needProfile) {
    uni.showModal({
      title: "完善头像和昵称",
      content: "补个头像和昵称，方便队友认出你。",
      confirmText: "去完善",
      cancelText: "稍后",
      success: (res) => {
        if (res.confirm) {
          uni.redirectTo({ url: "/pages/mine/profile?from=login" });
          return;
        }
        afterLoginRedirect(redirect.value);
      },
    });
    return;
  }
  // #endif
  afterLoginRedirect(redirect.value);
}
</script>

<style scoped>
.login {
  padding: 64rpx 48rpx 80rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.login__hero {
  margin-bottom: 24rpx;
}

.login__name {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: #1d4f91;
}

.login__lead {
  display: block;
  margin-top: 12rpx;
  font-size: 28rpx;
  line-height: 1.6;
  color: #6b7280;
}

.login__split,
.login__hint,
.login__dev {
  font-size: 24rpx;
  color: #9ca3af;
  text-align: center;
}

.login__code {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.login__code :deep(.wd-input) {
  flex: 1;
}

.login__agree {
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
}

.login__agree-text {
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b7280;
}

.login__link {
  color: #1d4f91;
}
</style>
