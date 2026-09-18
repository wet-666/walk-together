const FALLBACK_NATIVE_BASE = "http://127.0.0.1:3000/api/v1";

function trimSlash(url: string): string {
  return url.replace(/\/$/, "");
}

// H5 可以用相对路径。App / 小程序要写完整 http(s) 地址。
export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim();

  // #ifdef H5
  return trimSlash(fromEnv || "/api/v1");
  // #endif

  // #ifdef MP-WEIXIN || APP-PLUS
  const nativeBase = fromEnv ?? "";
  if (nativeBase && /^https?:\/\//.test(nativeBase)) {
    return trimSlash(nativeBase);
  }
  return FALLBACK_NATIVE_BASE;
  // #endif

  return trimSlash(fromEnv || "/api/v1");
}

export const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT ?? 10000);

export const CN_MOBILE = /^1[3-9]\d{9}$/;

export function isLoopbackApiBase(): boolean {
  return /127\.0\.0\.1|localhost/i.test(getApiBaseUrl());
}

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) {
    return "";
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const base = getApiBaseUrl();
  if (url.startsWith("/")) {
    return `${base}${url}`;
  }
  return `${base}/${url}`;
}
