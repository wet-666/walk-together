import { createHmac } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

export function generateUserSig(
  sdkAppId: number,
  secretKey: string,
  userId: string,
  expireSeconds = 86400 * 7,
): { userSig: string; expireAt: string } {
  const time = Math.floor(Date.now() / 1000);
  const contentToBeSigned =
    `TLS.identifier:${userId}\n` +
    `TLS.sdkappid:${sdkAppId}\n` +
    `TLS.time:${time}\n` +
    `TLS.expire:${expireSeconds}\n`;
  const signature = createHmac('sha256', secretKey).update(contentToBeSigned).digest('base64');
  const payload = JSON.stringify({
    'TLS.ver': '2.0',
    'TLS.identifier': userId,
    'TLS.sdkappid': sdkAppId,
    'TLS.expire': expireSeconds,
    'TLS.time': time,
    'TLS.sig': signature,
  });
  const compressed = deflateRawSync(Buffer.from(payload));
  return {
    userSig: compressed
      .toString('base64')
      .replace(/\+/g, '*')
      .replace(/\//g, '-')
      .replace(/=/g, '_'),
    expireAt: new Date((time + expireSeconds) * 1000).toISOString(),
  };
}
