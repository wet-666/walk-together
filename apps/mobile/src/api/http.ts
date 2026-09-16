import type { ApiResult, HealthData } from "@walk-together/shared-types";
import { ErrorCode } from "@walk-together/shared-types";
import { API_TIMEOUT_MS, getApiBaseUrl } from "../config/env";
import { clearSession, getToken } from "../store/session";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  header?: Record<string, string>;
  data?: object;
  loading?: boolean;
  toast?: boolean;
  authRedirect?: boolean;
  retry?: boolean;
};

let redirecting = false;

function currentRoute(): string {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1] as { route?: string } | undefined;
  return page?.route || "";
}

function handleUnauthorized(authRedirect: boolean, code?: number): void {
  clearSession();
  if (
    !authRedirect ||
    currentRoute() === "pages/auth/login" ||
    redirecting
  ) {
    return;
  }
  if (code === ErrorCode.ACCOUNT_DISABLED) {
    return;
  }
  redirecting = true;
  uni.navigateTo({
    url: "/pages/auth/login",
    complete: () => {
      redirecting = false;
    },
  });
}

function networkMessage(errMsg = ""): string {
  if (/timeout/i.test(errMsg)) {
    return "网络超时，请稍后重试";
  }
  if (/fail|network|offline|disconnect/i.test(errMsg)) {
    return "网络异常，请检查网络后重试";
  }
  return "服务未就绪";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  return requestOnce<T>(path, options).then(async (result) => {
    const method = options.method ?? "GET";
    if (
      method === "GET" &&
      options.retry !== false &&
      result.code === ErrorCode.SERVICE_UNAVAILABLE
    ) {
      await sleep(400);
      return requestOnce<T>(path, { ...options, loading: false, retry: false });
    }
    return result;
  });
}

function requestOnce<T>(
  path: string,
  options: RequestOptions,
): Promise<ApiResult<T>> {
  const loading = options.loading === true;
  const toast = options.toast !== false;
  const authRedirect = options.authRedirect !== false;

  if (loading) {
    uni.showLoading({ title: "加载中", mask: true });
  }

  return new Promise((resolve) => {
    uni.request({
      method: options.method ?? "GET",
      data: options.data as Record<string, string> | undefined,
      url: `${getApiBaseUrl()}${path}`,
      timeout: API_TIMEOUT_MS,
      header: {
        "Content-Type": "application/json",
        ...options.header,
        ...tokenHeader(),
      },
      success: (res) => {
        const data = res.data as ApiResult<T>;
        if (data && typeof data.code === "number") {
          if (
            data.code === ErrorCode.UNAUTHORIZED ||
            data.code === ErrorCode.ACCOUNT_DISABLED ||
            res.statusCode === 401
          ) {
            handleUnauthorized(authRedirect, data.code);
          }
          if (toast && data.code !== ErrorCode.OK) {
            uni.showToast({ title: data.message || "请求失败", icon: "none" });
          }
          resolve(data);
          return;
        }
        if (res.statusCode === 401) {
          handleUnauthorized(authRedirect);
        }
        const fallback: ApiResult<T> = {
          code: ErrorCode.FAILED,
          message: "响应格式不正确",
          data: null,
        };
        if (toast) {
          uni.showToast({ title: fallback.message, icon: "none" });
        }
        resolve(fallback);
      },
      fail: (err) => {
        const fallback: ApiResult<T> = {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: networkMessage(err?.errMsg),
          data: null,
        };
        if (toast) {
          uni.showToast({ title: fallback.message, icon: "none" });
        }
        resolve(fallback);
      },
      complete: () => {
        if (loading) {
          uni.hideLoading();
        }
      },
    });
  });
}

export function upload<T>(
  path: string,
  filePath: string,
  name = "file",
): Promise<ApiResult<T>> {
  uni.showLoading({ title: "上传中", mask: true });
  return new Promise((resolve) => {
    uni.uploadFile({
      url: `${getApiBaseUrl()}${path}`,
      filePath,
      name,
      timeout: API_TIMEOUT_MS,
      header: tokenHeader(),
      success: (res) => {
        try {
          const data = JSON.parse(res.data) as ApiResult<T>;
          if (data.code !== ErrorCode.OK) {
            uni.showToast({ title: data.message || "上传失败", icon: "none" });
          }
          if (
            data.code === ErrorCode.UNAUTHORIZED ||
            data.code === ErrorCode.ACCOUNT_DISABLED
          ) {
            handleUnauthorized(true, data.code);
          }
          resolve(data);
        } catch {
          const fallback: ApiResult<T> = {
            code: ErrorCode.FAILED,
            message: "响应格式不正确",
            data: null,
          };
          uni.showToast({ title: fallback.message, icon: "none" });
          resolve(fallback);
        }
      },
      fail: (err) => {
        const fallback: ApiResult<T> = {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: networkMessage(err?.errMsg),
          data: null,
        };
        uni.showToast({ title: fallback.message, icon: "none" });
        resolve(fallback);
      },
      complete: () => {
        uni.hideLoading();
      },
    });
  });
}

export function getHealth() {
  return request<HealthData>("/health", {
    loading: false,
    toast: false,
    authRedirect: false,
  });
}
