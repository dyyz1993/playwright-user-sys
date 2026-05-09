#!/bin/bash
set -e

REMOTE_HOST="jd"
REMOTE_DIR="/opt/playwright-user-sys"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Syncing files to ${REMOTE_HOST}:${REMOTE_DIR} ..."

rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.dev' \
  --exclude='.env.test' \
  --exclude='tests' \
  --exclude='coverage' \
  --exclude='.husky' \
  --exclude='.opencode' \
  --exclude='.claude' \
  --exclude='*.test.ts' \
  --exclude='*.spec.ts' \
  --exclude='CLAUDE.md' \
  --exclude='AGENTS.md' \
  --exclude='.prettierrc' \
  --exclude='.eslintrc*' \
  --exclude='vitest*' \
  --exclude='playwright*' \
  ${LOCAL_DIR}/ ${REMOTE_HOST}:${REMOTE_DIR}/

echo "==> Copying production env ..."
rsync -avz ${LOCAL_DIR}/deploy/.env.production ${REMOTE_HOST}:${REMOTE_DIR}/.env

echo "==> Installing dependencies on server ..."
ssh ${REMOTE_HOST} "cd ${REMOTE_DIR} && pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod"

echo "==> Setting up path aliases ..."
ssh ${REMOTE_HOST} "cd ${REMOTE_DIR} && bash scripts/setup-aliases.sh"

echo "==> Creating data directory ..."
ssh ${REMOTE_HOST} "mkdir -p ${REMOTE_DIR}/data"

echo "==> Setting up nginx ..."
ssh ${REMOTE_HOST} "cp ${REMOTE_DIR}/deploy/nginx-playwright.conf /etc/nginx/sites-available/playwright && ln -sf /etc/nginx/sites-available/playwright /etc/nginx/sites-enabled/playwright && nginx -t && nginx -s reload"

echo "==> Starting/Restarting PM2 ..."
ssh ${REMOTE_HOST} "cd ${REMOTE_DIR} && pm2 delete pw-manager 2>/dev/null; pm2 start ecosystem.config.js && pm2 save"

echo ""
echo "==> Done! Access at: http://$(ssh ${REMOTE_HOST} 'hostname -I | awk \"{print \\$1}\"'):3200"
