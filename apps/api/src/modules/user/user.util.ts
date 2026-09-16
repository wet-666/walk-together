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
