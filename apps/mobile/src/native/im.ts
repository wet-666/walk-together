import type { ImCredentials } from "@walk-together/shared-types";
import { ErrorCode } from "@walk-together/shared-types";
import { getImCredentials } from "../api/im";

/**
 * 腾讯云 IM 的薄封装。没填 IM_SDK_APP_ID 时不登录 SDK，
 * 群聊走我们自己的接口和 WebSocket，H5 也能验。
 */
export async function prepareIm(): Promise<ImCredentials> {
  const result = await getImCredentials();
  if (result.code !== ErrorCode.OK || !result.data) {
    return {
      enabled: false,
      sdkAppId: null,
      userId: null,
      userSig: null,
      expireAt: null,
    };
  }
  return result.data;
}
