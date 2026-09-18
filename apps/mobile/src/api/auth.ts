import type {
  BindPhoneDto,
  LoginBySmsDto,
  LoginByWxDto,
  LoginResult,
  SendSmsDto,
  UpdateProfileDto,
  UserProfile,
} from "@walk-together/shared-types";
import { request, upload } from "./http";

export function sendSms(dto: SendSmsDto) {
  return request<null>("/auth/sms/send", {
    method: "POST",
    data: dto,
    loading: true,
  });
}

export function loginBySms(dto: LoginBySmsDto) {
  return request<LoginResult>("/auth/login/sms", {
    method: "POST",
    data: dto,
    loading: true,
  });
}

export function loginByWechat(dto: LoginByWxDto) {
  return request<LoginResult>("/auth/login/wechat", {
    method: "POST",
    data: dto,
    loading: true,
  });
}

export function logoutRequest() {
  return request<null>("/auth/logout", {
    method: "POST",
    toast: false,
    authRedirect: false,
  });
}

export function getMe() {
  return request<UserProfile>("/users/me", {
    toast: false,
    authRedirect: false,
  });
}

export function updateProfile(dto: UpdateProfileDto) {
  return request<UserProfile>("/users/me", {
    method: "PATCH",
    data: dto,
    loading: true,
  });
}

export function bindPhone(dto: BindPhoneDto) {
  return request<UserProfile>("/users/me/phone", {
    method: "POST",
    data: dto,
    loading: true,
  });
}

export function cancelAccount() {
  return request<null>("/users/me/cancel", {
    method: "POST",
    loading: true,
    authRedirect: false,
  });
}

export function uploadAvatar(filePath: string) {
  return upload<UserProfile>("/users/me/avatar", filePath);
}

export function submitFeedback(dto: { content: string; contact?: string }) {
  return request<null>("/users/me/feedback", {
    method: "POST",
    data: dto,
    loading: true,
  });
}
