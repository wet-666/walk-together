import { ErrorCode } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';
import { imageExt, parseChatText, tencentGroupId, tencentUserId, toIso, countMessageReaders } from './im.util';

describe('im.util', () => {
  it('trims and accepts chat text', () => {
    expect(parseChatText('  你好  ', 20)).toBe('你好');
  });

  it('rejects empty text', () => {
    try {
      parseChatText('   ', 20);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(ErrorCode.IM_INVALID);
    }
  });

  it('rejects text that is too long', () => {
    try {
      parseChatText('你好世界', 3);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(ErrorCode.IM_INVALID);
    }
  });

  it('maps image mime types', () => {
    expect(imageExt('image/jpeg')).toBe('.jpg');
    expect(imageExt('image/png')).toBe('.png');
    expect(imageExt('image/gif')).toBeNull();
  });

  it('builds tencent identifiers', () => {
    expect(tencentUserId(12)).toBe('u12');
    expect(tencentGroupId(9)).toBe('TRIP9');
  });

  it('treats naive mysql datetime as China time', () => {
    expect(toIso('2026-09-17 10:24:00')).toBe('2026-09-17T02:24:00.000Z');
  });

  it('counts other members who have read a message', () => {
    const cursors = new Map<number, number>([
      [1, 20],
      [2, 8],
      [3, 20],
    ]);
    expect(countMessageReaders(10, 1, [1, 2, 3], cursors)).toBe(1);
    expect(countMessageReaders(10, null, [1, 2, 3], cursors)).toBe(0);
  });
});
