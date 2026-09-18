# 同路行

自驾组队出行：登录、发布/加入行程、地图上看队友位置、车队群聊。

前端一套 Uni-App 源码，可编译为 H5、微信小程序和 App。后端为 NestJS，提供 REST 与 WebSocket。

当前验证码使用：123456

## 技术栈

- 前端：Uni-App（Vue 3）+ Vite
- 后端：NestJS
- 数据：MySQL 8.4、Redis 7
- 地图：高德

## 仓库结构

```
apps/mobile            用户端（H5 / 微信小程序 / App）
apps/api               NestJS API + WebSocket
packages/shared-types  前后端共用类型与错误码
deploy/                Nginx 与生产启动脚本
docker-compose.yml     本地 MySQL / Redis
docker-compose.prod.yml  生产编排
```

## 环境要求

- Node.js 20+
- pnpm 10
- Docker

## 本地开发

```bash
pnpm install
pnpm dev:infra
cp .env.example apps/api/.env
pnpm dev:api
pnpm dev:mobile
```

Windows 复制环境文件：

```bash
copy .env.example apps\api\.env
```

| 服务 | 地址 |
| --- | --- |
| API 探活 | http://127.0.0.1:3000/api/v1/health |
| H5 | http://localhost:5173/ |
| MySQL | `127.0.0.1:3307` |
| Redis | `127.0.0.1:6379` |

开发环境验证码为 `123456`。

微信小程序：

```bash
pnpm dev:mp
```

用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)导入 `apps/mobile/dist/dev/mp-weixin`。

## 环境变量

后端复制 `.env.example` 为 `apps/api/.env`。常用项：

| 变量 | 说明 |
| --- | --- |
| `MYSQL_*` / `REDIS_*` | 数据库与缓存 |
| `JWT_SECRET` | 登录令牌 |
| `AUTH_DEV_MODE` / `SMS_DEV_CODE` | 开发验证码 |
| `AMAP_WEB_KEY` | 后端地理编码与路线 |


## 脚本

```bash
pnpm dev:infra      # 启动 MySQL / Redis
pnpm dev:api        # 启动 API
pnpm dev:mobile     # 启动 H5
pnpm dev:mp         # 启动微信小程序
pnpm build:api      # 编译 API
pnpm build:h5       # 编译 H5
pnpm build:mp       # 编译微信小程序
pnpm build:deploy   # 同时编译 API 与 H5
```

API 单测：

```bash
pnpm --filter @walk-together/api test
```

## 部署

本机编译后再上服务器：

```bash
pnpm build:deploy
```
