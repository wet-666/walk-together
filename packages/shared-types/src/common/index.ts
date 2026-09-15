export interface ApiResult<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

export const ErrorCode = {
  OK: 0,
  FAILED: 1000,
  SERVICE_UNAVAILABLE: 1001,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
