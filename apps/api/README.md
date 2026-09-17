# API

NestJS 中台。当前到 M4：账号登录 + 行程组队 + 位置同步 + 车队群聊。

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

位置：

- `GET /api/v1/location/active` 当前可同步的行程地图快照
- `GET /api/v1/location/:tripId` 指定行程快照（需已入队）
- `POST /api/v1/location/:tripId` 上报经纬度
- `WS /api/v1/ws?token=` 按行程房间推送队友点和群聊

群聊：

- `GET /api/v1/im/credentials` 腾讯云 IM UserSig（没配密钥则 `enabled: false`）
- `GET /api/v1/im/unread` 未读总数
- `GET /api/v1/im/conversations` 我的车队群列表
- `GET /api/v1/im/trips/:tripId` 指定车队群
- `GET /api/v1/im/trips/:tripId/messages` 历史消息
- `POST /api/v1/im/trips/:tripId/messages` 发文字
- `POST /api/v1/im/trips/:tripId/images` 发图片
- `POST /api/v1/im/trips/:tripId/read` 标记已读

本地开发默认 `AUTH_DEV_MODE=true`，短信验证码为 `123456`。配齐短信密钥后走真短信。`AMAP_WEB_KEY` 选填，有则发布时把地点地理编码成经纬度，地图上画驾车路线；没有就只存地名，地图用成员点和直线。H5 可拖动底图走前端 `VITE_AMAP_JS_KEY`，没填时用示意图。`IM_SDK_APP_ID` / `IM_SECRET_KEY` 选填，没有时群聊仍走本服务；有则签发 UserSig，并在入队/退队时同步腾讯云 IM 群。
