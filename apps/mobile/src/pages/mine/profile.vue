<template>
  <view class="profile">
    <view class="profile__avatar">
      <!-- #ifdef MP-WEIXIN -->
      <button class="profile__avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
        <wd-avatar :src="avatarSrc" :text="avatarText" size="large" />
      </button>
      <!-- #endif -->
      <!-- #ifndef MP-WEIXIN -->
      <view class="profile__avatar-btn" @click="onPickAvatar">
        <wd-avatar :src="avatarSrc" :text="avatarText" size="large" />
      </view>
      <!-- #endif -->
      <text class="profile__hint">点击更换头像</text>
    </view>

    <!-- #ifdef MP-WEIXIN -->
    <view class="profile__field">
      <text class="profile__label">昵称</text>
      <input
        class="profile__nickname"
        type="nickname"
        :value="nickname"
        maxlength="32"
        placeholder="微信昵称"
        @blur="onNicknameBlur"
        @input="onNicknameInput"
      />
    </view>
    <!-- #endif -->
    <!-- #ifndef MP-WEIXIN -->
    <wd-input v-model="nickname" placeholder="昵称" :maxlength="32" clearable />
    <!-- #endif -->

    <!-- #ifdef H5 -->
    <wd-input v-model="avatarUrl" placeholder="头像 URL（可选）" clearable />
    <!-- #endif -->

    <wd-input v-model="vehicleModel" placeholder="车型（选填）" :maxlength="64" clearable />
    <wd-input v-model="plateNumber" placeholder="车牌号（选填）" :maxlength="16" clearable />

    <wd-button type="primary" block :loading="saving" @click="onSave">保存</wd-button>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { ErrorCode } from "@walk-together/shared-types";
import { computed, ref } from "vue";
import { getMe, updateProfile, uploadAvatar } from "../../api/auth";
import { resolveMediaUrl } from "../../config/env";
import { getProfile, setProfile } from "../../store/session";

const nickname = ref("");
const avatarUrl = ref("");
const vehicleModel = ref("");
const plateNumber = ref("");
const saving = ref(false);
const fromLogin = ref(false);

const avatarSrc = computed(() => resolveMediaUrl(avatarUrl.value));
const avatarText = computed(() => nickname.value.slice(0, 1) || "同");

onLoad((query) => {
  fromLogin.value = String(query?.from || "") === "login";
  fill(getProfile());
  void refresh();
});

async function refresh() {
  const result = await getMe();
  if (result.code === ErrorCode.OK && result.data) {
    setProfile(result.data);
    fill(result.data);
  }
}

function fill(profile: ReturnType<typeof getProfile>) {
  if (!profile) {
    return;
  }
  nickname.value = profile.nickname || "";
  avatarUrl.value = profile.avatarUrl || "";
  vehicleModel.value = profile.vehicleModel || "";
  plateNumber.value = profile.plateNumber || "";
}

function onNicknameInput(event: { detail?: { value?: string } }) {
  nickname.value = String(event.detail?.value ?? "");
}

function onNicknameBlur(event: { detail?: { value?: string } }) {
  nickname.value = String(event.detail?.value ?? nickname.value).trim();
}

function onChooseAvatar(event: { detail?: { avatarUrl?: string } }) {
  const path = event.detail?.avatarUrl || "";
  if (!path) {
    return;
  }
  if (/^https?:\/\//i.test(path)) {
    avatarUrl.value = path;
    return;
  }
  void uploadLocal(path);
}

function onPickAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    success: (res) => {
      const path = res.tempFilePaths[0];
      if (path) {
        void uploadLocal(path);
      }
    },
  });
}

async function uploadLocal(filePath: string) {
  const result = await uploadAvatar(filePath);
  if (result.code === ErrorCode.OK && result.data) {
    setProfile(result.data);
    fill(result.data);
    uni.showToast({ title: "头像已更新", icon: "none" });
  }
}

async function onSave() {
  if (saving.value) {
    return;
  }
  const name = nickname.value.trim();
  if (!name) {
    uni.showToast({ title: "请填写昵称", icon: "none" });
    return;
  }
  saving.value = true;
  const result = await updateProfile({
    nickname: name,
    avatarUrl: avatarUrl.value.trim() || undefined,
    vehicleModel: vehicleModel.value,
    plateNumber: plateNumber.value,
  });
  saving.value = false;
  if (result.code === ErrorCode.OK && result.data) {
    setProfile(result.data);
    uni.showToast({ title: "已保存", icon: "none" });
    setTimeout(() => {
      if (fromLogin.value) {
        uni.switchTab({ url: "/pages/mine/index" });
        return;
      }
      uni.navigateBack();
    }, 400);
  }
}
</script>

<style scoped>
.profile {
  padding: 48rpx 40rpx 80rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.profile__avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.profile__avatar-btn {
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  line-height: 1;
}

.profile__avatar-btn::after {
  border: none;
}

.profile__hint {
  font-size: 24rpx;
  color: #9ca3af;
}

.profile__field {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx 28rpx;
}

.profile__label {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
  margin-bottom: 8rpx;
}

.profile__nickname {
  width: 100%;
  font-size: 30rpx;
  color: #111827;
}
</style>
