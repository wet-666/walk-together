import type { ApiResult, HealthData } from "@walk-together/shared-types";
import { ErrorCode } from "@walk-together/shared-types";
import { API_TIMEOUT_MS, getApiBaseUrl } from "../config/env";
import { clearSession, getToken } from "../store/session";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  header?: Record<string, string>;
  data?: object;
  loading?: boolean;
  toast?: boolean;
  authRedirect?: boolean;
};

let redirecting = false;

function currentRoute(): string {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1] as { route?: string } | undefined;
  return page?.route || "";
}

function handleUnauthorized(authRedirect: boolean): void {
  clearSession();
  if (!authRedirect || currentRoute() === "pages/auth/login" || redirecting) {
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

export function request<T>(
  path: string,
  options: RequestOptions = {},
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
        ...options.header,
        ...tokenHeader(),
      },
      success: (res) => {
        const data = res.data as ApiResult<T>;
        if (data && typeof data.code === "number") {
          if (
            data.code === ErrorCode.UNAUTHORIZED ||
            res.statusCode === 401
          ) {
            handleUnauthorized(authRedirect);
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
      fail: () => {
        const fallback: ApiResult<T> = {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: "服务未就绪",
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

export function getHealth() {
  return request<HealthData>("/health", {
    loading: false,
    toast: false,
    authRedirect: false,
  });
}
