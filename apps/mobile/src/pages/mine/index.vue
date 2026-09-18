<template>
  <view v-if="profile" class="mine">
    <view class="mine__card" @click="goProfile">
      <wd-avatar :src="avatarSrc" :text="avatarText" size="large" />
      <view class="mine__meta">
        <text class="mine__name">{{ profile.nickname }}</text>
        <text class="mine__phone">{{ maskPhone(profile.phone) }}</text>
        <text class="mine__car">{{ carText }}</text>
        <wd-tag custom-class="mine__tag" mark>{{ certLabel }}</wd-tag>
      </view>
    </view>

    <view class="mine__stats">
      <view class="mine__stat" @click="goTrips('active')">
        <text class="mine__stat-num">{{ activeCount }}</text>
        <text class="mine__stat-label">进行中</text>
      </view>
      <view class="mine__stat" @click="goTrips('history')">
        <text class="mine__stat-num">{{ historyCount }}</text>
        <text class="mine__stat-label">历史行程</text>
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
      <wd-cell title="我的行程" :value="tripHint" is-link @click="goTrips()" />
      <wd-cell title="车主认证" :value="certLabel" is-link @click="toastLater('车主认证还没开')" />
      <wd-cell title="设置" is-link @click="goSettings" />
    </wd-cell-group>

    <view class="mine__logout">
      <wd-button type="error" plain block @click="onLogout">退出登录</wd-button>
    </view>
  </view>

  <view v-else>
    <EmptyState
      title="登录后开始组队"
      description="登录后可以发布行程、组队，地图上也能看到队友。"
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
import { CertStatus, ErrorCode, type TripSummary, type UserProfile } from "@walk-together/shared-types";
import { computed, ref } from "vue";
import EmptyState from "../../components/EmptyState.vue";
import { getMe, logoutRequest } from "../../api/auth";
import { listMine } from "../../api/trip";
import { resolveMediaUrl } from "../../config/env";
import {
  clearSession,
  getProfile,
  isLoggedIn,
  maskPhone,
  setProfile,
} from "../../store/session";

const profile = ref<UserProfile | null>(null);
const trips = ref<TripSummary[]>([]);

const avatarSrc = computed(() => resolveMediaUrl(profile.value?.avatarUrl));
const avatarText = computed(() => profile.value?.nickname?.slice(0, 1) || "同");
const carText = computed(() => {
  const model = profile.value?.vehicleModel?.trim();
  const plate = profile.value?.plateNumber?.trim();
  if (model && plate) {
    return `${model} · ${plate}`;
  }
  return model || plate || "未填写车型车牌";
});
const certLabel = computed(() => {
  if (profile.value?.certStatus === CertStatus.APPROVED) {
    return "已认证";
  }
  if (profile.value?.certStatus === CertStatus.PENDING) {
    return "审核中";
  }
  return "未认证";
});
const activeCount = computed(() => trips.value.filter(isActiveMine).length);
const historyCount = computed(() => trips.value.filter((item) => !isActiveMine(item)).length);
const tripHint = computed(() => {
  if (!trips.value.length) {
    return "还没有";
  }
  return `${activeCount.value} 进行中`;
});

onShow(() => {
  void refresh();
});

async function refresh() {
  if (!isLoggedIn()) {
    profile.value = null;
    trips.value = [];
    return;
  }
  profile.value = getProfile();
  const [me, mine] = await Promise.all([getMe(), listMine("all")]);
  if (me.code === ErrorCode.OK && me.data) {
    setProfile(me.data);
    profile.value = me.data;
  } else if (me.code === ErrorCode.UNAUTHORIZED || me.code === ErrorCode.ACCOUNT_DISABLED) {
    clearSession();
    profile.value = null;
    trips.value = [];
    return;
  }
  trips.value = mine.code === ErrorCode.OK && mine.data ? mine.data : [];
}

function isActiveMine(item: TripSummary): boolean {
  const liveTrip = item.status === "recruiting" || item.status === "ongoing";
  const liveMember =
    item.myStatus === "approved" || item.myStatus === "pending" || item.myStatus === "leave_pending";
  return liveTrip && liveMember;
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

function goTrips(tab?: "active" | "history") {
  const query = tab ? `?tab=${tab}` : "";
  uni.navigateTo({ url: `/pages/mine/trips${query}` });
}

function toastLater(title: string) {
  uni.showToast({ title, icon: "none" });
}

function onLogout() {
  uni.showModal({
    title: "退出登录",
    content: "退出后仍可浏览广场，组队、地图和群聊需要重新登录。",
    success: (res) => {
      if (res.confirm) {
        void doLogout();
      }
    },
  });
}

async function doLogout() {
  await logoutRequest();
  clearSession();
  profile.value = null;
  trips.value = [];
  uni.showToast({ title: "已退出登录", icon: "none" });
}
</script>

<style scoped>
.mine {
  padding: 32rpx 0 48rpx;
  max-width: 860px;
  margin: 0 auto;
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

.mine__phone,
.mine__car {
  font-size: 26rpx;
  color: #6b7280;
}

.mine__stats {
  margin: 0 24rpx 24rpx;
  padding: 24rpx 0;
  background: #fff;
  border-radius: 16rpx;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.mine__stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.mine__stat-num {
  font-size: 36rpx;
  font-weight: 600;
  color: #111827;
}

.mine__stat-label {
  font-size: 24rpx;
  color: #6b7280;
}

.mine__logout,
.mine__extra {
  padding: 32rpx 48rpx 0;
}
</style>
