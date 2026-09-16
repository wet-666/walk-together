import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  WechatClient,
  type BindPhoneDto,
  type LoginBySmsDto,
  type LoginByWxDto,
  type LoginResult,
  type SendSmsDto,
  type UserProfile,
} from '@walk-together/shared-types';
import { TokenService } from '../../common/auth/token.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { SmsService } from './sms.service';
import { UserService } from './user.service';
import { WechatService } from './wechat.service';
import { assertPhone } from './user.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly sms: SmsService,
    private readonly wechat: WechatService,
    private readonly users: UserService,
    private readonly tokens: TokenService,
  ) {}

  sendSms(dto: SendSmsDto): Promise<void> {
    return this.sms.send(dto.phone);
  }

  async loginBySms(dto: LoginBySmsDto): Promise<LoginResult> {
    const phone = assertPhone(dto.phone);
    await this.sms.consume(phone, dto.code ?? '');
    const profile = await this.users.loginByPhone(phone);
    return this.issue(profile);
  }

  async loginByWechat(dto: LoginByWxDto): Promise<LoginResult> {
    if (dto.client !== WechatClient.MINI && dto.client !== WechatClient.APP) {
      throw new BusinessException(ErrorCode.WECHAT_CODE_INVALID, '微信登录暂不可用，请用手机号');
    }

    const identity = await this.wechat.exchange(dto.code ?? '', dto.client);
    const profile = await this.users.loginByWechat({
      client: dto.client,
      openid: identity.openid,
      unionid: identity.unionid,
      nickname: dto.nickname || identity.nickname,
      avatarUrl: dto.avatarUrl || identity.avatarUrl,
    });
    return this.issue(profile);
  }

  async bindPhone(userId: number, dto: BindPhoneDto): Promise<UserProfile> {
    const phone = assertPhone(dto.phone);
    await this.sms.consume(phone, dto.code ?? '');
    return this.users.bindPhone(userId, phone);
  }

  async logout(jti: string | undefined, exp: number | undefined): Promise<void> {
    if (!jti) {
      return;
    }
    await this.tokens.revoke(jti, this.tokens.remainingTtl(exp ?? 0));
  }

  async cancel(userId: number, jti: string | undefined, exp: number | undefined): Promise<void> {
    await this.users.cancel(userId);
    await this.logout(jti, exp);
  }

  private issue(profile: UserProfile): LoginResult {
    const signed = this.tokens.sign(profile.id);
    return {
      token: signed.token,
      expiresIn: signed.expiresIn,
      profile,
    };
  }
}
