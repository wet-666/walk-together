import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@walk-together/shared-types';
import { RedisService } from '../../common/redis/redis.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { assertPhone } from './user.util';

const CODE_TTL_SECONDS = 5 * 60;
const SEND_GAP_SECONDS = 60;
const DAY_LIMIT = 10;
const FAIL_LIMIT = 5;

@Injectable()
export class SmsService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async send(phone: string): Promise<void> {
    const mobile = assertPhone(phone);
    if (!this.devAuthEnabled()) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '短信通道未接通，请先配置短信密钥或开启开发验证码',
      );
    }

    const locked = await this.redis.setNx(this.sendKey(mobile), SEND_GAP_SECONDS, '1');
    if (!locked) {
      throw new BusinessException(ErrorCode.SMS_SEND_TOO_FAST, '请稍后再获取验证码');
    }

    const dayKey = this.dayKey(mobile);
    const sent = await this.redis.incr(dayKey);
    if (sent === 1) {
      await this.redis.expire(dayKey, 24 * 60 * 60);
    }
    if (sent > DAY_LIMIT) {
      await this.redis.del(this.sendKey(mobile));
      throw new BusinessException(ErrorCode.SMS_DAY_LIMIT, '今天获取验证码次数已用完');
    }

    const code = this.config.get<string>('SMS_DEV_CODE', '123456');
    await this.redis.setEx(this.codeKey(mobile), CODE_TTL_SECONDS, code);
    await this.redis.del(this.failKey(mobile));
  }

  async consume(phone: string, code: string): Promise<void> {
    const mobile = assertPhone(phone);
    const expected = await this.redis.get(this.codeKey(mobile));
    if (!expected) {
      throw new BusinessException(ErrorCode.SMS_CODE_INVALID, '验证码不正确或已过期');
    }

    if (expected !== code.trim()) {
      const fails = await this.redis.incr(this.failKey(mobile));
      if (fails === 1) {
        await this.redis.expire(this.failKey(mobile), CODE_TTL_SECONDS);
      }
      if (fails >= FAIL_LIMIT) {
        await this.redis.del(this.codeKey(mobile), this.failKey(mobile));
      }
      throw new BusinessException(ErrorCode.SMS_CODE_INVALID, '验证码不正确或已过期');
    }

    await this.redis.del(this.codeKey(mobile), this.failKey(mobile), this.sendKey(mobile));
  }

  private devAuthEnabled(): boolean {
    return (
      this.config.get<string>('NODE_ENV', 'development') !== 'production' &&
      this.config.get<string>('AUTH_DEV_MODE', 'true') !== 'false'
    );
  }

  private codeKey(phone: string): string {
    return `sms:code:${phone}`;
  }

  private sendKey(phone: string): string {
    return `sms:send:${phone}`;
  }

  private failKey(phone: string): string {
    return `sms:fail:${phone}`;
  }

  private dayKey(phone: string): string {
    const day = new Date().toISOString().slice(0, 10);
    return `sms:day:${phone}:${day}`;
  }
}
