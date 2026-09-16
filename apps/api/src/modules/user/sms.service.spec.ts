import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';
import { RedisService } from '../../common/redis/redis.service';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  const redis = {
    setNx: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    setEx: jest.fn(),
    get: jest.fn(),
  };

  let sms: SmsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) => {
              const values: Record<string, string> = {
                NODE_ENV: 'development',
                AUTH_DEV_MODE: 'true',
                SMS_DEV_CODE: '123456',
              };
              return values[key] ?? fallback;
            },
          },
        },
      ],
    }).compile();
    sms = module.get(SmsService);
  });

  it('stores the development code', async () => {
    redis.setNx.mockResolvedValue(true);
    redis.incr.mockResolvedValue(1);
    await sms.send('13800138000');
    expect(redis.setEx).toHaveBeenCalledWith('sms:code:13800138000', 300, '123456');
  });

  it('rejects a wrong code', async () => {
    redis.get.mockResolvedValue('123456');
    redis.incr.mockResolvedValue(1);
    await expect(sms.consume('13800138000', '000000')).rejects.toMatchObject({
      errorCode: ErrorCode.SMS_CODE_INVALID,
    } satisfies Partial<BusinessException>);
  });
});
