import type {
  LoginBySmsDto,
  LoginByWxDto,
  LoginResult,
  SendSmsDto,
  UserProfile,
} from "@walk-together/shared-types";
import { request } from "./http";

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
