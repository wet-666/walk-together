# 同路行

自驾组队出行。第一期只做：登录 → 建队 → 地图看见对方 → 群里说话。

当前阶段是 **M0 仓库与基建**：能启动，能连库，密钥不进代码。还没有登录和行程业务。

## 怎么跑

本机需要 Node 20+、pnpm、Docker。

```bash
pnpm install
pnpm dev:infra
copy .env.example apps\api\.env
pnpm dev:api
pnpm dev:mobile
```

- 后端探活：http://127.0.0.1:3000/api/v1/health
- 用户端 H5：http://localhost:5173/
- 本地 MySQL 映射到 **3307**（避免和本机已有 3306 冲突），Redis 仍是 6379

## 仓库结构

```
apps/mobile            Uni-App（APP + 微信小程序同一工程）
apps/api               NestJS
packages/shared-types  接口类型和错误码
```

商家 / 运营后台以后再加 `apps/admin`，现在不要建。
