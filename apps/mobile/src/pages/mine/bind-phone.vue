<template>
  <view class="bind">
    <text class="bind__lead">绑了之后就能用这个手机号登录。</text>
    <wd-input
      v-model="phone"
      type="number"
      placeholder="手机号"
      :maxlength="11"
      clearable
    />
    <view class="bind__code">
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
    <wd-button type="primary" block :loading="submitting" @click="onBind">
      绑定手机号
    </wd-button>
    <text v-if="showDevHint" class="bind__dev">开发环境验证码 123456</text>
  </view>
</template>

<script setup lang="ts">
import { onUnload } from "@dcloudio/uni-app";
import { ErrorCode } from "@walk-together/shared-types";
import { onUnmounted, ref } from "vue";
import { bindPhone, sendSms } from "../../api/auth";
import { CN_MOBILE } from "../../config/env";
import { setProfile } from "../../store/session";

const phone = ref("");
const code = ref("");
const sending = ref(false);
const submitting = ref(false);
const countdown = ref(0);
const showDevHint = import.meta.env.DEV;
let timer: ReturnType<typeof setInterval> | null = null;

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

function assertPhoneInput(): boolean {
  if (CN_MOBILE.test(phone.value.trim())) {
    return true;
  }
  uni.showToast({ title: "请输入 11 位手机号", icon: "none" });
  return false;
}

async function onSendSms() {
  if (sending.value || countdown.value > 0) {
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

async function onBind() {
  if (submitting.value) {
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
  const result = await bindPhone({ phone: phone.value.trim(), code: code.value.trim() });
  submitting.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    setProfile(result.data);
    uni.showToast({ title: "已绑定手机号", icon: "none" });
    setTimeout(() => {
      uni.navigateBack();
    }, 400);
  }
}
</script>

<style scoped>
.bind {
  padding: 48rpx 40rpx 80rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.bind__lead,
.bind__dev {
  font-size: 26rpx;
  line-height: 1.6;
  color: #6b7280;
}

.bind__dev {
  text-align: center;
  color: #9ca3af;
}

.bind__code {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.bind__code :deep(.wd-input) {
  flex: 1;
}
</style>
