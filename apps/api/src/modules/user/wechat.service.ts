import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, WechatClient, type WechatClientValue } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';

export type WechatIdentity = {
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
};

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);

  constructor(private readonly config: ConfigService) {}

  async exchange(code: string, client: WechatClientValue): Promise<WechatIdentity> {
    const trimmed = code.trim();
    if (!trimmed) {
      throw new BusinessException(ErrorCode.WECHAT_CODE_INVALID, '微信登录暂不可用，请用手机号');
    }

    if (this.devAuthEnabled() && trimmed.startsWith('dev:')) {
      const seed = trimmed.slice(4) || 'local';
      return {
        openid: `dev_${client}_${seed}`,
        unionid: `dev_union_${seed}`,
        nickname: null,
        avatarUrl: null,
      };
    }

    if (client === WechatClient.MINI) {
      return this.miniSession(trimmed);
    }
    return this.appSession(trimmed);
  }

  private async miniSession(code: string): Promise<WechatIdentity> {
    const appId = this.config.get<string>('WECHAT_MINI_APP_ID', '').trim();
    const secret = this.config.get<string>('WECHAT_MINI_APP_SECRET', '').trim();
    if (!appId || !secret) {
      throw new BusinessException(ErrorCode.WECHAT_CODE_INVALID, '微信登录暂不可用，请用手机号');
    }

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appId);
    url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    const payload = await this.getJson(url);
    if (!payload.openid) {
      this.logger.warn(`mini code2session failed: ${payload.errmsg ?? 'unknown'}`);
      throw new BusinessException(ErrorCode.WECHAT_CODE_INVALID, '微信登录暂不可用，请用手机号');
    }

    return {
      openid: payload.openid,
      unionid: payload.unionid ?? null,
      nickname: null,
      avatarUrl: null,
    };
  }

  private async appSession(code: string): Promise<WechatIdentity> {
    const appId = this.config.get<string>('WECHAT_APP_ID', '').trim();
    const secret = this.config.get<string>('WECHAT_APP_SECRET', '').trim();
    if (!appId || !secret) {
      throw new BusinessException(ErrorCode.WECHAT_CODE_INVALID, '微信登录暂不可用，请用手机号');
    }

    const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
    tokenUrl.searchParams.set('appid', appId);
    tokenUrl.searchParams.set('secret', secret);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('grant_type', 'authorization_code');

    const token = await this.getJson(tokenUrl);
    if (!token.openid || !token.access_token) {
      this.logger.warn(`app oauth failed: ${token.errmsg ?? 'unknown'}`);
      throw new BusinessException(ErrorCode.WECHAT_CODE_INVALID, '微信登录暂不可用，请用手机号');
    }

    const profileUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
    profileUrl.searchParams.set('access_token', token.access_token);
    profileUrl.searchParams.set('openid', token.openid);
    const profile = await this.getJson(profileUrl);

    return {
      openid: token.openid,
      unionid: token.unionid ?? profile.unionid ?? null,
      nickname: profile.nickname ?? null,
      avatarUrl: profile.headimgurl ?? null,
    };
  }

  private async getJson(url: URL): Promise<Record<string, string | undefined>> {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new BusinessException(ErrorCode.WECHAT_CODE_INVALID, '微信登录暂不可用，请用手机号');
    }
    return (await response.json()) as Record<string, string | undefined>;
  }

  private devAuthEnabled(): boolean {
    return (
      this.config.get<string>('NODE_ENV', 'development') !== 'production' &&
      this.config.get<string>('AUTH_DEV_MODE', 'true') !== 'false'
    );
  }
}
