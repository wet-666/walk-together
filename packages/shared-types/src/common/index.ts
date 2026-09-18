export interface ApiResult<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

export const ErrorCode = {
  OK: 0,
  FAILED: 1000,
  SERVICE_UNAVAILABLE: 1001,
  UNAUTHORIZED: 1101,
  SMS_CODE_INVALID: 1102,
  SMS_SEND_TOO_FAST: 1103,
  WECHAT_CODE_INVALID: 1104,
  ACCOUNT_DISABLED: 1105,
  PHONE_INVALID: 1106,
  SMS_DAY_LIMIT: 1107,
  PROFILE_INVALID: 1108,
  PHONE_BIND_CONFLICT: 1109,
  FEEDBACK_INVALID: 1110,
  TRIP_INVALID: 1201,
  TRIP_NOT_FOUND: 1202,
  TRIP_FORBIDDEN: 1203,
  TRIP_FULL: 1204,
  TRIP_ALREADY_MEMBER: 1205,
  TRIP_APPLY_INVALID: 1206,
  LOCATION_INVALID: 1301,
  IM_INVALID: 1401,
  IM_FORBIDDEN: 1402,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export type HealthStatus = 'ok' | 'down';

export interface HealthData {
  mysql: HealthStatus;
  redis: HealthStatus;
  uptime: number;
  version: string;
}
