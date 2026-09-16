<template>
  <view class="login">
    <view class="login__hero">
      <text class="login__name">同路行</text>
      <text class="login__lead">微信授权或手机验证码，登录后就可以组队出发</text>
    </view>

    <!-- #ifdef MP-WEIXIN || APP-PLUS -->
    <wd-button type="primary" block :disabled="!agreed" @click="onWechatLogin">
      微信一键登录
    </wd-button>
    <view class="login__split">
      <text>或用手机号</text>
    </view>
    <!-- #endif -->

    <!-- #ifdef H5 -->
    <text class="login__hint">H5 开发请用手机验证码。微信登录在小程序和 App 中使用。</text>
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
      <wd-button size="small" plain :disabled="countdown > 0" @click="onSendSms">
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
import { ErrorCode, WechatClient, type WechatClientValue } from "@walk-together/shared-types";
import { onUnmounted, ref } from "vue";
import { loginBySms, loginByWechat, sendSms } from "../../api/auth";
import { afterLoginRedirect, setSession } from "../../store/session";

const phone = ref("");
const code = ref("");
const agreed = ref(false);
const submitting = ref(false);
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

function openAgreement(type: "user" | "privacy") {
  uni.navigateTo({ url: `/pages/mine/agreement?type=${type}` });
}

function wechatClient(): WechatClientValue {
  // #ifdef APP-PLUS
  return WechatClient.APP;
  // #endif
  return WechatClient.MINI;
}

async function onSendSms() {
  if (!assertAgreed()) {
    return;
  }
  const result = await sendSms({ phone: phone.value });
  if (result.code === ErrorCode.OK) {
    startCountdown();
    uni.showToast({ title: "验证码已发送", icon: "none" });
  }
}

async function onSmsLogin() {
  if (!assertAgreed() || submitting.value) {
    return;
  }
  submitting.value = true;
  const result = await loginBySms({ phone: phone.value, code: code.value });
  submitting.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    setSession(result.data);
    afterLoginRedirect(redirect.value);
  }
}

function onWechatLogin() {
  if (!assertAgreed()) {
    return;
  }

  uni.login({
    provider: "weixin",
    success: (res) => {
      void submitWechat(res.code);
    },
    fail: () => {
      uni.showToast({ title: "已取消微信登录", icon: "none" });
    },
  });
}

async function submitWechat(wxCode: string) {
  submitting.value = true;
  const result = await loginByWechat({ code: wxCode, client: wechatClient() });
  submitting.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    setSession(result.data);
    afterLoginRedirect(redirect.value);
  }
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
