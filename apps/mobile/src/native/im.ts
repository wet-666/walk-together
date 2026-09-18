import type { ImCredentials } from "@walk-together/shared-types";
import { ErrorCode } from "@walk-together/shared-types";
import { getImCredentials } from "../api/im";

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
