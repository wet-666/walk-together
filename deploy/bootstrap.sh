#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 跑：sudo bash deploy/bootstrap.sh"
  exit 1
fi

if ! swapon --show | grep -q .; then
  echo "创建 2G swap..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

sysctl -w vm.overcommit_memory=1 >/dev/null
grep -q '^vm.overcommit_memory' /etc/sysctl.conf || echo 'vm.overcommit_memory = 1' >> /etc/sysctl.conf

if ! command -v docker >/dev/null 2>&1; then
  echo "安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if [ ! -f apps/api/.env ]; then
  cp .env.example apps/api/.env
  echo "已生成 apps/api/.env（内测可用验证码 123456）"
fi

if [ ! -f apps/api/dist/main.js ]; then
  echo "缺少 apps/api/dist，请先在本机执行 pnpm build:api 再上传"
  exit 1
fi

if [ ! -f apps/mobile/dist/build/h5/index.html ]; then
  echo "缺少 H5 产物，请先在本机执行 pnpm build:h5 再上传"
  exit 1
fi

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
echo "探活：curl -sS http://127.0.0.1/api/v1/health"
