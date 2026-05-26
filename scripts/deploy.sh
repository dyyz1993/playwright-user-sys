#!/bin/bash
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
REMOTE_DIR="/data/docker/playwright-user-sys/docker"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_rsa}"
SSH_PORT="${DEPLOY_SSH_PORT:-10000}"
SSH_USER="${DEPLOY_SSH_USER:-root}"
SSH_HOST="${DEPLOY_HOST:-192.168.0.29}"

ssh_cmd="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -p $SSH_PORT $SSH_USER@$SSH_HOST"
LOCAL_SHA=$(git rev-parse --short HEAD)

PULL_TARGET="${1:-manager}"

echo "=== Deploy (commit: $LOCAL_SHA, target: $PULL_TARGET) ==="

echo "[1/3] Pulling latest images..."
$ssh_cmd "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE pull $PULL_TARGET" 2>&1 | tail -5

echo "[2/3] Force recreating..."
$ssh_cmd "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE up -d --force-recreate $PULL_TARGET" 2>&1 | tail -5

echo "[3/3] Verifying..."
sleep 5

HEALTH=$($ssh_cmd "curl -s http://localhost:3011/health" 2>/dev/null || echo "FAILED")
STATUS=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('status','unknown'), '| machines:', d.get('components',{}).get('grpc',{}).get('machines','?'))" 2>/dev/null || echo "parse-error")

CONTAINERS=$($ssh_cmd "docker ps --format '{{.Names}} {{.Status}}' | grep playwright" 2>/dev/null)

echo ""
echo "=== Result ==="
echo "  Commit:  $LOCAL_SHA"
echo "  Health:  $STATUS"
echo ""
echo "$CONTAINERS"
echo ""

if echo "$STATUS" | grep -q "ok"; then
  echo "  Deploy SUCCESS"
else
  echo "  WARNING: Health check issue"
  echo "  Logs: $ssh_cmd 'docker logs playwright-manager-prod --tail 30'"
fi
