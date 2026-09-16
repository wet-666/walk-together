# API

NestJS 中台。M1 提供探活和账号登录：

- `GET /api/v1/health`
- `POST /api/v1/auth/sms/send`
- `POST /api/v1/auth/login/sms`
- `POST /api/v1/auth/login/wechat`
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me` 资料：昵称、头像 URL、车型、车牌
- `POST /api/v1/users/me/phone` 登录后绑定/更换手机
- `POST /api/v1/users/me/avatar` 头像图片（无 OSS，落本地 `uploads/`）
- `POST /api/v1/users/me/cancel` 注销（软删除，同一微信/手机不能再登）

本地开发默认 `AUTH_DEV_MODE=true`，短信验证码为 `123456`。配齐 `SMS_ACCESS_KEY` / `SMS_ACCESS_SECRET` / `SMS_SIGN_NAME` / `SMS_TEMPLATE_CODE` 后，非开发模式会走阿里云或腾讯云真短信。
