# 同路行

自驾组队出行。第一期 MVP 只做：登录 → 建队 → 地图看见对方 → 群里说话。

当前阶段是 **M3 地图位置**：组队之后，首页地图能看到自己、队友和本队路线。大约 5 秒上报一次；WebSocket 通的时候队友点会动，弱网改成 30 秒轮询。群聊还没有。

H5 没密钥时仍可用开发验证码 `123456`。配了短信/微信密钥后走真通道。没配高德 JS Key 时，地图页用示意图，位置同步照样走。配了 `AMAP_WEB_KEY` 会把路线画成驾车折线。

## 本机怎么跑

需要 Node 20+、pnpm、Docker Desktop。

```bash
pnpm install
pnpm dev:infra
copy .env.example apps\api\.env
pnpm dev:api
pnpm dev:mobile
```

- 后端探活：http://127.0.0.1:3000/api/v1/health
- 用户端 H5：http://localhost:5173/
- 微信小程序开发：`pnpm dev:mp`，用微信开发者工具打开 `apps/mobile/dist/dev/mp-weixin`
- 本地 MySQL 映射到 **3307**（避免和本机已有 3306 冲突），Redis 仍是 6379

小程序 / APP 真机不能走 Vite 代理。把 `apps/mobile/.env.development` 里的 `VITE_API_BASE_URL` 改成电脑局域网地址，例如 `http://192.168.1.8:3000/api/v1`。开发阶段请关闭小程序「校验合法域名」。

真微信小程序登录：把 AppID 填进 `apps/mobile/src/manifest.json` 的 `mp-weixin.appid`，把 AppID/AppSecret 填进 `apps/api/.env` 的 `WECHAT_MINI_APP_ID` / `WECHAT_MINI_APP_SECRET`。App 微信登录另填 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`，并在 HBuilderX 打包时带上微信登录原生 SDK；没开放平台时入口仍在，失败会提示用手机号。

真短信：`SMS_PROVIDER` 默认 `aliyun`，还需 `SMS_TEMPLATE_CODE`（腾讯云再加 `SMS_SDK_APP_ID`）。密钥不要提交 git。

## 部署（M0 只交付 API + H5 反代）

密钥全部走环境变量，HTTPS 由 Nginx 或云负载均衡终止。

```bash
copy .env.example apps\api\.env
docker compose -f docker-compose.prod.yml up -d --build
```

H5 发行产物在 `apps/mobile/dist/build/h5`，放到 Nginx 的 html 目录，配置见 `deploy/nginx.h5.conf`。正式环境把 `CORS_ORIGIN` 改成 H5 域名；微信小程序要在后台配置 request 合法域名，并把 `apps/mobile/.env.production` 的接口改成 `https://你的域名/api/v1`。

APP 打包仍需 HBuilderX；本仓库用 CLI 出资源和 H5 / 小程序。

## 仓库结构

```
apps/mobile            Uni-App（APP + 微信小程序 + H5，同一工程）
apps/api               NestJS
packages/shared-types  接口类型和错误码
deploy/nginx.h5.conf   H5 反代示例
docker-compose.yml     本地 MySQL / Redis
docker-compose.prod.yml  含 API 镜像
```

商家 / 运营后台以后再加 `apps/admin`，现在不要建。
