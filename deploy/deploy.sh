#!/usr/bin/env bash
# 更新线上部署：构建前端（/feixingqi/ 子路径）→ 打包上传 → 重启服务。
# 用法：./deploy/deploy.sh
# 可用环境变量覆盖：DEPLOY_HOST（默认 root@139.224.254.109）、DEPLOY_KEY（默认 ~/.ssh/id_ed25519_139_224_254_109）
set -euo pipefail

HOST=${DEPLOY_HOST:-root@139.224.254.109}
KEY=${DEPLOY_KEY:-$HOME/.ssh/id_ed25519_139_224_254_109}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ARCHIVE=${TMPDIR:-/tmp}/fly-deploy.tgz

echo "==> 构建前端（/feixingqi/ 子路径）"
cd "$ROOT/web"
npm ci --no-audit --no-fund --registry=https://registry.npmmirror.com
npm test
npm run build -- --mode subpath

echo "==> 打包"
cd "$ROOT"
tar czf "$ARCHIVE" server/src server/package.json server/package-lock.json web/dist deploy

echo "==> 上传到 $HOST"
scp -i "$KEY" -o StrictHostKeyChecking=no "$ARCHIVE" "$HOST:/tmp/fly-deploy.tgz"

echo "==> 远端安装与重启"
ssh -i "$KEY" -o StrictHostKeyChecking=no "$HOST" 'set -e
  tar xzf /tmp/fly-deploy.tgz -C /opt/feixingqi
  cd /opt/feixingqi/server
  npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com
  chown -R feixingqi:feixingqi /opt/feixingqi
  # systemd 单元有更新时同步推送（服务一律由 systemd 托管，不用 nohup）
  if [ -f /opt/feixingqi/deploy/feixingqi.service ]; then
    cp /opt/feixingqi/deploy/feixingqi.service /etc/systemd/system/feixingqi.service
    systemctl daemon-reload
  fi
  systemctl restart feixingqi.service
  sleep 2
  systemctl --no-pager status feixingqi.service | head -6
  curl -s http://127.0.0.1:18090/api/health'

echo "==> 完成：http://${HOST#*@}/feixingqi/"
