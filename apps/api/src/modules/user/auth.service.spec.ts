import { Test } from '@nestjs/testing';
import { TokenService } from '../../common/auth/token.service';
import { AuthService } from './auth.service';
import { SmsService } from './sms.service';
import { UserService } from './user.service';
import { WechatService } from './wechat.service';

const profile = {
  id: 1,
  phone: '13800138000',
  nickname: '同路人8000',
  avatarUrl: null,
  vehicleModel: null,
  plateNumber: null,
  certStatus: 'none',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('AuthService', () => {
  const sms = { send: jest.fn(), consume: jest.fn() };
  const users = {
    loginByPhone: jest.fn(),
    loginByWechat: jest.fn(),
    bindPhone: jest.fn(),
    cancel: jest.fn(),
  };
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
    users.loginByPhone.mockResolvedValue(profile);
    tokens.sign.mockReturnValue({ token: 'jwt', expiresIn: 60, jti: 'jti' });

    await expect(
      auth.loginBySms({ phone: '13800138000', code: '123456' }),
    ).resolves.toMatchObject({
      token: 'jwt',
      expiresIn: 60,
      profile: { id: 1, phone: '13800138000' },
    });
  });

  it('binds a phone after verifying the sms code', async () => {
    sms.consume.mockResolvedValue(undefined);
    users.bindPhone.mockResolvedValue({ ...profile, phone: '13900139000' });

    await expect(
      auth.bindPhone(1, { phone: '13900139000', code: '123456' }),
    ).resolves.toMatchObject({ phone: '13900139000' });
    expect(sms.consume).toHaveBeenCalledWith('13900139000', '123456');
  });
});
