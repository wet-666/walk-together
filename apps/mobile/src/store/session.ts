import type { LoginResult, UserProfile } from "@walk-together/shared-types";

const TOKEN_KEY = "token";
const PROFILE_KEY = "profile";

export function getToken(): string {
  return String(uni.getStorageSync(TOKEN_KEY) || "");
}

export function getProfile(): UserProfile | null {
  const raw = uni.getStorageSync(PROFILE_KEY);
  if (!raw) {
    return null;
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as UserProfile;
    } catch {
      return null;
    }
  }
  return raw as UserProfile;
}

export function setSession(result: LoginResult): void {
  uni.setStorageSync(TOKEN_KEY, result.token);
  uni.setStorageSync(PROFILE_KEY, result.profile);
}

export function setProfile(profile: UserProfile): void {
  uni.setStorageSync(PROFILE_KEY, profile);
}

export function clearSession(): void {
  uni.removeStorageSync(TOKEN_KEY);
  uni.removeStorageSync(PROFILE_KEY);
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) {
    return "未绑定手机号";
  }
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

const TAB_PAGES = new Set([
  "/pages/map/index",
  "/pages/message/index",
  "/pages/trip/index",
  "/pages/mine/index",
]);

export function ensureLogin(redirect: string): boolean {
  if (isLoggedIn()) {
    return true;
  }
  uni.navigateTo({
    url: `/pages/auth/login?redirect=${encodeURIComponent(redirect)}`,
  });
  return false;
}

export function afterLoginRedirect(redirect?: string): void {
  if (redirect && redirect.startsWith("/pages/")) {
    if (TAB_PAGES.has(redirect.split("?")[0])) {
      uni.switchTab({ url: redirect });
      return;
    }
    uni.redirectTo({ url: redirect });
    return;
  }

  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack();
    return;
  }
  uni.switchTab({ url: "/pages/mine/index" });
}
