import { ErrorCode } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';

export const CN_MOBILE = /^1[3-9]\d{9}$/;

export function assertPhone(phone: string): string {
  const value = (phone ?? '').trim();
  if (!CN_MOBILE.test(value)) {
    throw new BusinessException(ErrorCode.PHONE_INVALID, '请输入 11 位手机号');
  }
  return value;
}

export function defaultNickname(seed: string): string {
  const tail = seed.replace(/[^0-9a-zA-Z]/g, '').slice(-4) || '0000';
  return `同路人${tail}`;
}

export function isPlaceholderNickname(nickname: string): boolean {
  return /^同路人[0-9a-zA-Z]{0,8}$/.test((nickname ?? '').trim());
}

export function assertNickname(nickname: string): string {
  const value = (nickname ?? '').trim();
  if (!value || value.length > 32) {
    throw new BusinessException(ErrorCode.PROFILE_INVALID, '昵称请输入 1–32 个字');
  }
  return value;
}

export function normalizeOptional(
  value: string | undefined,
  max: number,
  label: string,
): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > max) {
    throw new BusinessException(ErrorCode.PROFILE_INVALID, `${label}过长`);
  }
  return trimmed;
}

export function assertAvatarUrl(url: string): string {
  const value = url.trim();
  if (!value) {
    throw new BusinessException(ErrorCode.PROFILE_INVALID, '头像地址不正确');
  }
  if (value.length > 512) {
    throw new BusinessException(ErrorCode.PROFILE_INVALID, '头像地址过长');
  }
  if (value.startsWith('/files/')) {
    return value;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('bad protocol');
    }
  } catch {
    throw new BusinessException(ErrorCode.PROFILE_INVALID, '头像地址不正确');
  }
  return value;
}
