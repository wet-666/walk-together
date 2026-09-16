import { Test } from '@nestjs/testing';
import { ErrorCode } from '@walk-together/shared-types';
import { DatabaseService } from '../../common/database/database.service';
import { TokenService } from '../../common/auth/token.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { UserService } from './user.service';

describe('UserService', () => {
  const db = {
    query: jest.fn(),
    exec: jest.fn(),
    withTransaction: jest.fn(),
  };
  const tokens = { blockUser: jest.fn() };
  let users: UserService;

  const wechatUser = {
    id: 1,
    phone: null,
    wx_unionid: 'u1',
    wx_mini_openid: 'm1',
    wx_app_openid: null,
    nickname: '同路人微信',
    avatar_url: null,
    status: 1,
    vehicle_model: null,
    plate_number: null,
    cert_status: 0,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  };

  const smsUser = {
    id: 2,
    phone: '13800138000',
    wx_unionid: null,
    wx_mini_openid: null,
    wx_app_openid: null,
    nickname: '同路人8000',
    avatar_url: null,
    status: 1,
    vehicle_model: '途观',
    plate_number: '粤A12345',
    cert_status: 0,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    db.withTransaction.mockImplementation(async (work: (ops: typeof db) => unknown) =>
      work(db),
    );
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: DatabaseService, useValue: db },
        { provide: TokenService, useValue: tokens },
      ],
    }).compile();
    users = module.get(UserService);
  });

  it('merges a sms-only account onto the wechat user', async () => {
    db.query
      .mockResolvedValueOnce([wechatUser])
      .mockResolvedValueOnce([smsUser])
      .mockResolvedValueOnce([
        { ...wechatUser, phone: '13800138000', vehicle_model: '途观', plate_number: '粤A12345' },
      ]);
    db.exec.mockResolvedValue({ affectedRows: 1 });

    const profile = await users.bindPhone(1, '13800138000');
    expect(profile.phone).toBe('13800138000');
    expect(profile.vehicleModel).toBe('途观');
    expect(db.exec).toHaveBeenCalled();
  });

  it('rejects binding a phone already used by another wechat account', async () => {
    db.query.mockResolvedValueOnce([wechatUser]).mockResolvedValueOnce([
      { ...smsUser, wx_mini_openid: 'other' },
    ]);

    await expect(users.bindPhone(1, '13800138000')).rejects.toMatchObject({
      errorCode: ErrorCode.PHONE_BIND_CONFLICT,
    } satisfies Partial<BusinessException>);
  });

  it('cancels the account and blocks the user', async () => {
    db.query.mockResolvedValue([wechatUser]);
    db.exec.mockResolvedValue({ affectedRows: 1 });
    await users.cancel(1);
    expect(tokens.blockUser).toHaveBeenCalledWith(1);
    expect(db.exec).toHaveBeenCalledWith(
      'UPDATE users SET status = 0 WHERE id = ? AND status = 1',
      [1],
    );
  });

  it('rejects login for a cancelled account', async () => {
    db.query.mockResolvedValue([{ ...wechatUser, status: 0, phone: '13800138000' }]);
    await expect(users.loginByPhone('13800138000')).rejects.toMatchObject({
      errorCode: ErrorCode.ACCOUNT_DISABLED,
    } satisfies Partial<BusinessException>);
  });
});
