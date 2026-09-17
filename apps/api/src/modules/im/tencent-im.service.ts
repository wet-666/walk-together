import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateUserSig } from './usersig';
import { tencentGroupId, tencentUserId } from './im.util';

type TencentResult = {
  ActionStatus?: string;
  ErrorCode?: number;
  ErrorInfo?: string;
  GroupId?: string;
};

@Injectable()
export class TencentImService {
  private readonly logger = new Logger(TencentImService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.sdkAppId() && this.secretKey());
  }

  credentials(userId: number): {
    enabled: boolean;
    sdkAppId: number | null;
    userId: string | null;
    userSig: string | null;
    expireAt: string | null;
  } {
    const sdkAppId = this.sdkAppId();
    const secretKey = this.secretKey();
    if (!sdkAppId || !secretKey) {
      return {
        enabled: false,
        sdkAppId: null,
        userId: null,
        userSig: null,
        expireAt: null,
      };
    }
    const identifier = tencentUserId(userId);
    const signed = generateUserSig(sdkAppId, secretKey, identifier);
    return {
      enabled: true,
      sdkAppId,
      userId: identifier,
      userSig: signed.userSig,
      expireAt: signed.expireAt,
    };
  }

  async ensureGroup(tripId: number, title: string, ownerUserId: number): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }
    await this.importAccount(ownerUserId);
    const result = await this.request('group_open_http_svc', 'create_group', {
      Owner_Account: tencentUserId(ownerUserId),
      Type: 'Private',
      Name: title.slice(0, 30) || `车队${tripId}`,
      GroupId: tencentGroupId(tripId),
      ApplyJoinOption: 'DisableApply',
    });
    if (result.ErrorCode === 10021 || result.ErrorCode === 10025) {
      return tencentGroupId(tripId);
    }
    if (result.ActionStatus !== 'OK') {
      this.logger.warn(`创建 IM 群失败 trip=${tripId} ${result.ErrorInfo || result.ErrorCode}`);
      return null;
    }
    return result.GroupId || tencentGroupId(tripId);
  }

  async addMember(groupId: string, userId: number): Promise<void> {
    if (!this.isEnabled() || !groupId) {
      return;
    }
    await this.importAccount(userId);
    const result = await this.request('group_open_http_svc', 'add_group_member', {
      GroupId: groupId,
      Silence: 1,
      MemberList: [{ Member_Account: tencentUserId(userId) }],
    });
    if (result.ActionStatus !== 'OK' && result.ErrorCode !== 10013) {
      this.logger.warn(`IM 进群失败 group=${groupId} user=${userId} ${result.ErrorInfo || result.ErrorCode}`);
    }
  }

  async removeMember(groupId: string, userId: number): Promise<void> {
    if (!this.isEnabled() || !groupId) {
      return;
    }
    const result = await this.request('group_open_http_svc', 'delete_group_member', {
      GroupId: groupId,
      Silence: 1,
      MemberToDel_Account: [tencentUserId(userId)],
    });
    if (result.ActionStatus !== 'OK' && result.ErrorCode !== 10014) {
      this.logger.warn(`IM 退群失败 group=${groupId} user=${userId} ${result.ErrorInfo || result.ErrorCode}`);
    }
  }

  private async importAccount(userId: number): Promise<void> {
    const result = await this.request('im_open_login_svc', 'account_import', {
      UserID: tencentUserId(userId),
    });
    if (result.ActionStatus !== 'OK' && result.ErrorCode !== 70107) {
      this.logger.warn(`IM 导入账号失败 user=${userId} ${result.ErrorInfo || result.ErrorCode}`);
    }
  }

  private sdkAppId(): number | null {
    const raw = this.config.get<string>('IM_SDK_APP_ID', '').trim();
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  private secretKey(): string {
    return this.config.get<string>('IM_SECRET_KEY', '').trim();
  }

  private adminUser(): string {
    return this.config.get<string>('IM_ADMIN_USER', 'administrator').trim() || 'administrator';
  }

  private async request(service: string, command: string, body: Record<string, unknown>): Promise<TencentResult> {
    const sdkAppId = this.sdkAppId();
    const secretKey = this.secretKey();
    if (!sdkAppId || !secretKey) {
      return { ActionStatus: 'FAIL', ErrorCode: -1, ErrorInfo: 'not configured' };
    }
    const admin = this.adminUser();
    const { userSig } = generateUserSig(sdkAppId, secretKey, admin);
    const random = Math.floor(Math.random() * 4_294_967_295);
    const url =
      `https://console.tim.qq.com/v4/${service}/${command}` +
      `?sdkappid=${sdkAppId}&identifier=${encodeURIComponent(admin)}` +
      `&usersig=${encodeURIComponent(userSig)}&random=${random}&contenttype=json`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await response.json()) as TencentResult;
    } catch (error) {
      this.logger.warn(`IM REST 失败 ${service}/${command} ${error instanceof Error ? error.message : String(error)}`);
      return { ActionStatus: 'FAIL', ErrorCode: -1, ErrorInfo: 'network' };
    }
  }
}
