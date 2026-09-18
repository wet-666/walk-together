# 同路行

自驾组队：登录、建队、地图上看队友、群里说话。

开发环境验证码是 `123456`。地图用高德：后端 `AMAP_WEB_KEY` 做地理编码和路线，H5 用 `VITE_AMAP_JS_KEY`（可再配 `VITE_AMAP_JS_SECURITY`）。没配 JS Key 时页面会退回示意图，位置同步照样走。改前端 Key 后要重启 `pnpm dev:mobile`，并把 `localhost`、`127.0.0.1` 加进高德 JS Key 的域名白名单。头像和群聊图片存在本地 `uploads/`。

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
- H5：http://localhost:5173/
- 小程序：装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，跑 `pnpm dev:mp`，导入 `apps/mobile/dist/dev/mp-weixin`。没有正式 AppID 可用测试号，开发时关掉「不校验合法域名」
- 本地 MySQL 映射 **3307**（躲开本机 3306），Redis 仍是 6379

小程序模拟器里的地图是微信原生组件。H5 走高德 JS API，能拖，但不是同一套 SDK。

## 两台真机

电脑和两台手机连同一 Wi-Fi，本机跑 `pnpm dev:api` 和 `pnpm dev:mobile`。Windows 若拦入站，放行 **3000** 和 **5173**。

优先用 H5，不用先打包。Vite 会打出 `Network: http://192.168.x.x:5173/`，手机浏览器打开它，两个号分别用验证码 `123456` 登录：

1. A 登录 → 行程 → 发布（手填地名即可，比如成都 → 康定）
2. B 登录 → 申请加入，A 同意
3. 两边打开底部「地图」，真机定位后应能看见彼此；电脑浏览器通常没有 GPS，自己的点会停在起点附近
4. 「消息」进这支队的群，互发一条文字，也可以再发张图

手机浏览器走 HTTP 局域网时，系统可能不给 GPS。要真实定位，用 HBuilderX 打自定义基座 / 云打包，包名 `com.tongluxing.app`。App / 小程序走不了 Vite 代理，把 `apps/mobile/.env.development` 的 `VITE_API_BASE_URL` 改成 `http://192.168.x.x:3000/api/v1` 后重新编译。原生地图 Key 填 `apps/mobile/src/manifest.json` 的 `sdkConfigs.maps.amap`，不填也有系统底图。

上正式短信时配 `SMS_ACCESS_KEY` 等变量，密钥不要进 git。

## 部署

HTTPS 在 Nginx 或云负载均衡上终止。2G 轻量机别在服务器上编译，本机出产物再上传（MySQL 限 400MB，整套大概 700MB–1.1GB）：

```bash
pnpm build:api
pnpm build:h5
copy .env.example apps\api\.env
```

把仓库（含 `apps/api/dist` 和 `apps/mobile/dist/build/h5`，不要 `node_modules`）拷到服务器后：

```bash
sudo bash deploy/bootstrap.sh
```

会装 Docker、加 2G swap，Nginx 反代 80。H5 配置见 `deploy/nginx.h5.conf`。正式环境把 `CORS_ORIGIN` 改成 H5 域名。小程序要在后台配 request 合法域名，并把 `apps/mobile/.env.production` 写成 `https://你的域名/api/v1`。

APP 打包仍用 HBuilderX；仓库 CLI 出的是资源和 H5 / 小程序。

## 仓库结构

```
apps/mobile            Uni-App（APP + 微信小程序 + H5）
apps/api               NestJS
packages/shared-types  接口类型和错误码
deploy/nginx.h5.conf   H5 反代示例
docker-compose.yml     本地 MySQL / Redis
docker-compose.prod.yml  含 API 镜像
```
