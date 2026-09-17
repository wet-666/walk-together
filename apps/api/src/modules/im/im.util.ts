import { ErrorCode } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';

export function imInvalid(message: string): BusinessException {
  return new BusinessException(ErrorCode.IM_INVALID, message);
}

export function imForbidden(message: string): BusinessException {
  return new BusinessException(ErrorCode.IM_FORBIDDEN, message);
}

export function tencentUserId(userId: number): string {
  return `u${userId}`;
}

export function tencentGroupId(tripId: number): string {
  return `TRIP${tripId}`;
}

export function parseChatText(content: unknown, maxLength: number): string {
  const value = typeof content === 'string' ? content.trim() : '';
  if (!value) {
    throw imInvalid('请输入要发送的文字');
  }
  if (value.length > maxLength) {
    throw imInvalid(`文字不能超过 ${maxLength} 个字`);
  }
  return value;
}

export function imageExt(mimetype: string): string | null {
  if (mimetype === 'image/jpeg') {
    return '.jpg';
  }
  if (mimetype === 'image/png') {
    return '.png';
  }
  if (mimetype === 'image/webp') {
    return '.webp';
  }
  return null;
}

export function toIso(value: Date | string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) {
    return new Date().toISOString();
  }
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return new Date(raw).toISOString();
  }
  return new Date(raw.replace(' ', 'T') + '+08:00').toISOString();
}

export function countMessageReaders(
  messageId: number,
  senderId: number | null,
  liveUserIds: number[],
  cursors: Map<number, number>,
): number {
  if (senderId == null) {
    return 0;
  }
  let total = 0;
  for (const userId of liveUserIds) {
    if (userId === senderId) {
      continue;
    }
    if ((cursors.get(userId) || 0) >= messageId) {
      total += 1;
    }
  }
  return total;
}
