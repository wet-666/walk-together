# API

NestJS 中台。登录、发布、组队、定位、聊天。探活版本看 `APP_VERSION`。

账号：

- `GET /api/v1/health`
- `POST /api/v1/auth/sms/send`
- `POST /api/v1/auth/login/sms`
- `POST /api/v1/auth/login/wechat`
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `POST /api/v1/users/me/phone`
- `POST /api/v1/users/me/avatar` 头像落到 `uploads/`
- `POST /api/v1/users/me/cancel`
- `POST /api/v1/users/me/feedback`

行程：

- `GET /api/v1/trips`
- `GET /api/v1/trips/mine`
- `POST /api/v1/trips`
- `GET /api/v1/trips/:id`
- `PATCH /api/v1/trips/:id`
- `POST /api/v1/trips/:id/apply`
- `POST /api/v1/trips/:id/applications/:userId/approve|reject`
- `POST /api/v1/trips/:id/leave`
- `GET|PATCH /api/v1/trips/:id/copy`

位置：

- `GET /api/v1/location/active`
- `GET /api/v1/location/:tripId`
- `POST /api/v1/location/:tripId`
- `WS /api/v1/ws?token=`

群聊：

- `GET /api/v1/im/credentials`
- `GET /api/v1/im/unread`
- `GET /api/v1/im/conversations`
- `GET /api/v1/im/trips/:tripId`
- `GET /api/v1/im/trips/:tripId/messages`
- `POST /api/v1/im/trips/:tripId/messages`
- `POST /api/v1/im/trips/:tripId/images`
- `POST /api/v1/im/trips/:tripId/read`

本地默认 `AUTH_DEV_MODE=true`，验证码 `123456`。`AMAP_WEB_KEY` 用来地理编码和算路线，不填也能发布。H5 底图走前端的 `VITE_AMAP_JS_KEY`。服务听 `0.0.0.0:3000`。
