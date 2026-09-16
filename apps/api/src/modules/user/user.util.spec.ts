import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCode } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';
import { assertNickname, assertPhone, defaultNickname } from './user.util';

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

  it('builds the default nickname from the last four digits', () => {
    expect(defaultNickname('13800138000')).toBe('同路人8000');
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
});
