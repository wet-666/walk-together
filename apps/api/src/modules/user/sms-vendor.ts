import { createHash, createHmac, randomUUID } from 'node:crypto';

export type SmsVendorConfig = {
  provider: 'aliyun' | 'tencent';
  accessKey: string;
  accessSecret: string;
  signName: string;
  templateCode: string;
  sdkAppId?: string;
  region?: string;
};

export async function sendSmsByVendor(
  config: SmsVendorConfig,
  phone: string,
  code: string,
): Promise<void> {
  if (config.provider === 'tencent') {
    await sendTencent(config, phone, code);
    return;
  }
  await sendAliyun(config, phone, code);
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

async function sendAliyun(
  config: SmsVendorConfig,
  phone: string,
  code: string,
): Promise<void> {
  const params: Record<string, string> = {
    AccessKeyId: config.accessKey,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    RegionId: config.region || 'cn-hangzhou',
    SignName: config.signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: config.templateCode,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
  };

  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonical)}`;
  const signature = createHmac('sha1', `${config.accessSecret}&`)
    .update(stringToSign)
    .digest('base64');
  const url = `https://dysmsapi.aliyuncs.com/?${canonical}&Signature=${percentEncode(signature)}`;

  const payload = await getJson(url);
  if (payload.Code !== 'OK') {
    throw new Error(payload.Message || payload.Code || 'aliyun sms failed');
  }
}

async function sendTencent(
  config: SmsVendorConfig,
  phone: string,
  code: string,
): Promise<void> {
  const sdkAppId = config.sdkAppId?.trim();
  if (!sdkAppId) {
    throw new Error('SMS_SDK_APP_ID missing');
  }

  const host = 'sms.tencentcloudapi.com';
  const service = 'sms';
  const action = 'SendSms';
  const version = '2021-01-11';
  const region = config.region || 'ap-guangzhou';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: sdkAppId,
    SignName: config.signName,
    TemplateId: config.templateCode,
    TemplateParamSet: [code],
  });

  const hashedPayload = sha256Hex(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n');
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const secretDate = hmac('TC3' + config.accessSecret, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = hmac(secretSigning, stringToSign).toString('hex');
  const authorization = `TC3-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}`, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      'X-TC-Region': region,
    },
    body: payload,
  });
  const body = (await response.json()) as {
    Response?: {
      Error?: { Message?: string; Code?: string };
      SendStatusSet?: Array<{ Code?: string; Message?: string }>;
    };
  };
  const error = body.Response?.Error;
  if (error?.Code) {
    throw new Error(error.Message || error.Code);
  }
  const status = body.Response?.SendStatusSet?.[0];
  if (!status || status.Code !== 'Ok') {
    throw new Error(status?.Message || 'tencent sms failed');
  }
}

async function getJson(url: string): Promise<Record<string, string | undefined>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new Error(`sms http ${response.status}`);
  }
  return (await response.json()) as Record<string, string | undefined>;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}
