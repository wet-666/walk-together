import type { ApiResult } from "@walk-together/shared-types";
import { ErrorCode } from "@walk-together/shared-types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

function tokenHeader(): Record<string, string> {
  const token = uni.getStorageSync("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  header?: Record<string, string>;
  data?: unknown;
};

export function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  return new Promise((resolve) => {
    uni.request({
      method: options.method ?? "GET",
      data: options.data,
      url: `${BASE_URL}${path}`,
      header: {
        ...options.header,
        ...tokenHeader(),
      },
      success: (res) => {
        const data = res.data as ApiResult<T>;
        if (data && typeof data.code === "number") {
          resolve(data);
          return;
        }
        resolve({
          code: ErrorCode.FAILED,
          message: "响应格式不正确",
          data: null,
        });
      },
      fail: () => {
        resolve({
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: "服务未就绪",
          data: null,
        });
      },
    });
  });
}

export function getHealth() {
  return request<{ mysql: string; redis: string; uptime: number }>("/health");
}
