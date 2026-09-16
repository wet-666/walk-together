/** 车主认证。M1 只落库默认值 none，认证页在后续阶段。 */
export const CertStatus = {
  NONE: 'none',
  PENDING: 'pending',
  APPROVED: 'approved',
} as const;

export type CertStatusValue = (typeof CertStatus)[keyof typeof CertStatus];

export const WechatClient = {
  MINI: 'mini',
  APP: 'app',
} as const;

export type WechatClientValue = (typeof WechatClient)[keyof typeof WechatClient];

export interface UserProfile {
  id: number;
  phone: string | null;
  nickname: string;
  avatarUrl: string | null;
  vehicleModel: string | null;
  plateNumber: string | null;
  certStatus: CertStatusValue;
  createdAt: string;
}

export interface SendSmsDto {
  phone: string;
}

export interface LoginBySmsDto {
  phone: string;
  code: string;
}

export interface LoginByWxDto {
  code: string;
  client: WechatClientValue;
  nickname?: string;
  avatarUrl?: string;
}

export interface LoginResult {
  token: string;
  expiresIn: number;
  profile: UserProfile;
}

export interface BindPhoneDto {
  phone: string;
  code: string;
}

export interface UpdateProfileDto {
  nickname?: string;
  avatarUrl?: string;
  vehicleModel?: string;
  plateNumber?: string;
}
