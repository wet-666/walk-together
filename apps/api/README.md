# API

NestJS 中台。M1 提供探活和账号登录：

- `GET /api/v1/health`
- `POST /api/v1/auth/sms/send`
- `POST /api/v1/auth/login/sms`
- `POST /api/v1/auth/login/wechat`
- `GET /api/v1/users/me`
- `POST /api/v1/auth/logout`

本地开发默认 `AUTH_DEV_MODE=true`，短信验证码为 `123456`。
