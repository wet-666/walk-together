#!/bin/bash
set -euo pipefail
mysql -e "CREATE DATABASE IF NOT EXISTS walk_together DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
PASS="$(openssl rand -base64 18 | tr -d '/+=' | head -c 24)"
JWT="$(openssl rand -hex 32)"
mysql -e "CREATE USER IF NOT EXISTS 'walk'@'localhost' IDENTIFIED BY '${PASS}';"
mysql -e "ALTER USER 'walk'@'localhost' IDENTIFIED BY '${PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON walk_together.* TO 'walk'@'localhost'; FLUSH PRIVILEGES;"
if grep -q '^maxmemory ' /etc/redis/redis.conf; then
  sed -i 's/^maxmemory .*/maxmemory 32mb/' /etc/redis/redis.conf
else
  echo 'maxmemory 32mb' >> /etc/redis/redis.conf
fi
if grep -q '^maxmemory-policy' /etc/redis/redis.conf; then
  sed -i 's/^maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
else
  echo 'maxmemory-policy allkeys-lru' >> /etc/redis/redis.conf
fi
systemctl restart redis-server
mkdir -p /opt/walk-together/apps/api /opt/walk-together/h5
cat > /opt/walk-together/apps/api/.env <<EOF
NODE_ENV=development
PORT=3000
APP_VERSION=0.1.0-m6
CORS_ORIGIN=*
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=walk
MYSQL_PASSWORD=${PASS}
MYSQL_DATABASE=walk_together
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
JWT_SECRET=${JWT}
JWT_EXPIRES_IN=7d
AUTH_DEV_MODE=true
SMS_DEV_CODE=123456
EOF
chmod 600 /opt/walk-together/apps/api/.env
echo "db_ready"
