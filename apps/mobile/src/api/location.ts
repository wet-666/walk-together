import type {
  GeoLngLat,
  LocationPoint,
  ReportLocationDto,
  TripMapSnapshot,
} from "@walk-together/shared-types";
import { getToken } from "../store/session";
import { request } from "./http";

export function getActiveMap() {
  return request<TripMapSnapshot | null>("/location/active", {
    toast: false,
  });
}

export function getTripMap(tripId: number) {
  return request<TripMapSnapshot | null>(`/location/${tripId}`, {
    toast: false,
  });
}

export function reportLocation(tripId: number, dto: ReportLocationDto) {
  return request<LocationPoint>(`/location/${tripId}`, {
    method: "POST",
    data: dto,
    toast: false,
    loading: false,
  });
}

export function fetchTripBasemap(tripId: number): Promise<string | null> {
  const token = getToken();
  if (!token) {
    return Promise.resolve(null);
  }
  const url = `${getHttpBase()}/location/${tripId}/basemap`;
  if (typeof fetch === "function") {
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) {
          return null;
        }
        const mime = res.headers.get("content-type") || "";
        if (!mime.includes("image")) {
          return null;
        }
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      })
      .catch(() => null);
  }
  return new Promise((resolve) => {
    uni.request({
      url,
      method: "GET",
      responseType: "arraybuffer",
      header: { Authorization: `Bearer ${token}` },
      success: (res) => {
        if (res.statusCode !== 200 || !res.data) {
          resolve(null);
          return;
        }
        const blob = new Blob([res.data as ArrayBuffer], { type: "image/png" });
        resolve(URL.createObjectURL(blob));
      },
      fail: () => resolve(null),
    });
  });
}

export function getWsUrl(token: string): string {
  const base = getHttpBase();
  const wsBase = base.replace(/^http/i, "ws");
  const joiner = wsBase.includes("?") ? "&" : "?";
  return `${wsBase}/ws${joiner}token=${encodeURIComponent(token)}`;
}

function getHttpBase(): string {
  const fromRequest = (globalThis as { location?: { protocol: string; host: string } }).location;
  // #ifdef H5
  if (fromRequest) {
    return `${fromRequest.protocol}//${fromRequest.host}/api/v1`;
  }
  // #endif
  return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000/api/v1";
}

export type { GeoLngLat, LocationPoint, TripMapSnapshot };
