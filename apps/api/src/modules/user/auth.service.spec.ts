import { Test } from '@nestjs/testing';
import { TokenService } from '../../common/auth/token.service';
import { AuthService } from './auth.service';
import { SmsService } from './sms.service';
import { UserService } from './user.service';
import { WechatService } from './wechat.service';

describe('AuthService', () => {
  const sms = { send: jest.fn(), consume: jest.fn() };
  const users = { loginByPhone: jest.fn(), loginByWechat: jest.fn() };
  const wechat = { exchange: jest.fn() };
  const tokens = { sign: jest.fn(), revoke: jest.fn(), remainingTtl: jest.fn() };

  let auth: AuthService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SmsService, useValue: sms },
        { provide: UserService, useValue: users },
        { provide: WechatService, useValue: wechat },
        { provide: TokenService, useValue: tokens },
      ],
    }).compile();
    auth = module.get(AuthService);
  });

  it('issues a token after sms login', async () => {
    sms.consume.mockResolvedValue(undefined);
    users.loginByPhone.mockResolvedValue({
      id: 1,
      phone: '13800138000',
      nickname: '同路人8000',
      avatarUrl: null,
      certStatus: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    tokens.sign.mockReturnValue({ token: 'jwt', expiresIn: 60, jti: 'jti' });

    await expect(
      auth.loginBySms({ phone: '13800138000', code: '123456' }),
    ).resolves.toMatchObject({
      token: 'jwt',
      expiresIn: 60,
      profile: { id: 1, phone: '13800138000' },
    });
  });
});
