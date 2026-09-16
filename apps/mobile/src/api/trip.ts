import type {
  ApplyJoinDto,
  CreateTripDto,
  TripCopy,
  TripDetail,
  TripSummary,
  UpdateCopyDto,
  UpdateTripDto,
  UserProfile,
} from "@walk-together/shared-types";
import { request, upload } from "./http";

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function listPlaza(params: {
  keyword?: string;
  code?: string;
  lng?: number;
  lat?: number;
  sort?: "time" | "distance";
  nearby?: boolean;
}) {
  return request<TripSummary[]>(
    `/trips${queryString({
      keyword: params.keyword,
      code: params.code,
      lng: params.lng,
      lat: params.lat,
      sort: params.sort,
      nearby: params.nearby ? "1" : undefined,
    })}`,
  );
}

export function listMine() {
  return request<TripSummary[]>("/trips/mine");
}

export function getTrip(id: number, code?: string) {
  return request<TripDetail>(`/trips/${id}${queryString({ code })}`);
}

export function createTrip(dto: CreateTripDto) {
  return request<TripDetail>("/trips", {
    method: "POST",
    data: dto,
    loading: true,
  });
}

export function updateTrip(id: number, dto: UpdateTripDto) {
  return request<TripDetail>(`/trips/${id}`, {
    method: "PATCH",
    data: dto,
    loading: true,
  });
}

export function uploadCover(id: number, filePath: string) {
  return upload<TripDetail>(`/trips/${id}/cover`, filePath);
}

export function applyTrip(id: number, dto: ApplyJoinDto) {
  return request<TripDetail>(`/trips/${id}/apply`, {
    method: "POST",
    data: dto,
    loading: true,
  });
}

export function leaveTrip(id: number) {
  return request<TripDetail>(`/trips/${id}/leave`, {
    method: "POST",
    loading: true,
  });
}

export function approveMember(tripId: number, userId: number) {
  return request<TripDetail>(`/trips/${tripId}/applications/${userId}/approve`, {
    method: "POST",
    loading: true,
  });
}

export function rejectMember(tripId: number, userId: number) {
  return request<TripDetail>(`/trips/${tripId}/applications/${userId}/reject`, {
    method: "POST",
    loading: true,
  });
}

export function removeMember(tripId: number, userId: number) {
  return request<TripDetail>(`/trips/${tripId}/members/${userId}/remove`, {
    method: "POST",
    loading: true,
  });
}

export function startTrip(id: number) {
  return request<TripDetail>(`/trips/${id}/start`, {
    method: "POST",
    loading: true,
  });
}

export function endTrip(id: number) {
  return request<TripDetail>(`/trips/${id}/end`, {
    method: "POST",
    loading: true,
  });
}

export function cancelTrip(id: number) {
  return request<TripDetail>(`/trips/${id}/cancel`, {
    method: "POST",
    loading: true,
  });
}

export function getTripCopy(id: number) {
  return request<TripCopy>(`/trips/${id}/copy`);
}

export function updateTripCopy(id: number, dto: UpdateCopyDto) {
  return request<TripCopy>(`/trips/${id}/copy`, {
    method: "PATCH",
    data: dto,
    loading: true,
  });
}

export function setAnnouncement(id: number, announcement: string) {
  return request<TripDetail>(`/trips/${id}/announcement`, {
    method: "POST",
    data: { announcement },
    loading: true,
  });
}

export function formatDepartAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function memberLabel(status: string | null | undefined): string {
  if (status === "pending") {
    return "申请中";
  }
  if (status === "approved") {
    return "已入队";
  }
  if (status === "leave_pending") {
    return "退出审批中";
  }
  return "";
}

export type { UserProfile };
