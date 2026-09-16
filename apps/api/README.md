# API

NestJS 中台。当前到 M2：账号登录 + 行程组队。

账号：

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

行程：

- `GET /api/v1/trips` 公开招募列表，可用 `code` 搜邀请码
- `GET /api/v1/trips/mine` 我发布或申请过的
- `POST /api/v1/trips` 发布
- `GET /api/v1/trips/:id` 详情（成员、待审批）
- `PATCH /api/v1/trips/:id` 队长编辑
- `POST /api/v1/trips/:id/apply` 申请加入
- `POST /api/v1/trips/:id/applications/:userId/approve|reject` 队长审批（加入/退出）
- `POST /api/v1/trips/:id/leave` 申请退出
- `GET|PATCH /api/v1/trips/:id/copy` 个人副本

本地开发默认 `AUTH_DEV_MODE=true`，短信验证码为 `123456`。配齐短信密钥后走真短信。`AMAP_WEB_KEY` 选填，有则发布时把地点地理编码成经纬度；没有就只存地名。
