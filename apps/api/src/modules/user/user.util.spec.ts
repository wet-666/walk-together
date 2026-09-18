import { ErrorCode } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';
import { assertNickname, assertPhone, defaultNickname, parseFeedback } from './user.util';

describe('user.util', () => {
  it('accepts mainland mobile numbers', () => {
    expect(assertPhone(' 13800138000 ')).toBe('13800138000');
  });

  it('rejects invalid phones', () => {
    try {
      assertPhone('12345');
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(ErrorCode.PHONE_INVALID);
    }
  });

  it('builds the default nickname from prefix plus last four digits', () => {
    expect(defaultNickname('13800138000')).toBe('同路人808000');
    expect(defaultNickname('13900138000')).toBe('同路人908000');
  });

  it('rejects an empty nickname', () => {
    try {
      assertNickname('  ');
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(ErrorCode.PROFILE_INVALID);
    }
  });

  it('trims feedback and keeps optional contact', () => {
    expect(parseFeedback({ content: ' 地图看不清路名 ', contact: ' 13800138000 ' })).toEqual({
      content: '地图看不清路名',
      contact: '13800138000',
    });
  });

  it('rejects empty feedback', () => {
    try {
      parseFeedback({ content: '   ' });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(ErrorCode.FEEDBACK_INVALID);
    }
  });
});
