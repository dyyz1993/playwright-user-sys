#!/bin/bash
# Fast deploy: build locally, pipe directly to server via SSH
# Bypasses ghcr.io entirely - eliminates registry push/pull time
#
# Usage:
#   ./deploy-fast.sh              # Build & deploy both services
#   ./deploy-fast.sh manager      # Only manager
#   ./deploy-fast.sh machine      # Only machine
#
# Env overrides:
#   REMOTE_USER=root REMOTE_HOST=192.168.0.29 REMOTE_PORT=10000
#   REMOTE_DIR=/data/docker/playwright-user-sys
#
# Requirements:
#   - Docker Buildx (comes with Docker Desktop)
#   - SSH access to server with key-based auth

set -euo pipefail

SERVICE=${1:-all}
REMOTE_USER=${REMOTE_USER:-root}
REMOTE_HOST=${REMOTE_HOST:-192.168.0.29}
REMOTE_PORT=${REMOTE_PORT:-10000}
REMOTE_DIR=${REMOTE_DIR:-/data/docker/playwright-user-sys}

SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
SSH_CMD="ssh ${SSH_TARGET} -p ${REMOTE_PORT}"
COMPOSE_FILE="${REMOTE_DIR}/docker/docker-compose.prod.yml"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "${SCRIPT_DIR}")"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${BLUE}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }

build_and_ship() {
  local service=$1
  local dockerfile=$2
  local image_tag=$3

  log "Building ${service} image for linux/amd64..."
  docker buildx build \
    --platform linux/amd64 \
    -f "${ROOT_DIR}/${dockerfile}" \
    -t "${image_tag}" \
    --load \
    "${ROOT_DIR}"

  ok "Built ${service} (${image_tag})"

  # Compress and pipe directly to server - removes ghcr.io roundtrip
  log "Shipping ${service} to ${SSH_TARGET}:${REMOTE_PORT}..."
  docker save "${image_tag}" | gzip -c | ${SSH_CMD} "gunzip -c | docker load"
  ok "${service} loaded on server"
}

check_ssh() {
  log "Checking SSH connection to ${SSH_TARGET}:${REMOTE_PORT}..."
  ${SSH_CMD} "echo '  Connected to \$(hostname)'" > /dev/null 2>&1 || {
    warn "Cannot reach ${SSH_TARGET}:${REMOTE_PORT}"
    warn "Ensure SSH key-based auth is set up: ssh-copy-id -p ${REMOTE_PORT} ${SSH_TARGET}"
    exit 1
  }
  ok "SSH connection OK"
}

check_compose() {
  log "Checking docker-compose file on server..."
  ${SSH_CMD} "test -f ${COMPOSE_FILE}" || {
    warn "compose file not found at ${COMPOSE_FILE} on server"
    exit 1
  }
  ok "Found ${COMPOSE_FILE} on server"
}

echo ""
echo "═══════════════════════════════════════"
echo "  Fast Deploy - Build Local, Ship via SSH"
echo "═══════════════════════════════════════"
echo "  Service:  ${SERVICE}"
echo "  Server:   ${SSH_TARGET}:${REMOTE_PORT}"
echo "  Compose:  ${COMPOSE_FILE}"
echo "═══════════════════════════════════════"
echo ""

check_ssh
check_compose

cd "${ROOT_DIR}"

case "${SERVICE}" in
  manager)
    build_and_ship "manager" "docker/manager/Dockerfile.prod" "ghcr.io/dyyz1993/playwright-user-sys-manager:latest"
    ;;
  machine)
    build_and_ship "machine" "docker/machine/Dockerfile.prod" "ghcr.io/dyyz1993/playwright-user-sys-machine:latest"
    ;;
  all)
    build_and_ship "manager" "docker/manager/Dockerfile.prod" "ghcr.io/dyyz1993/playwright-user-sys-manager:latest"
    build_and_ship "machine" "docker/machine/Dockerfile.prod" "ghcr.io/dyyz1993/playwright-user-sys-machine:latest"
    ;;
  *)
    echo "Usage: $0 [manager|machine|all]"
    exit 1
    ;;
esac

log "Restarting containers on server..."
${SSH_CMD} "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} up -d"

ok "Containers restarted"
log "Checking service status..."
${SSH_CMD} "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} ps"

echo ""
echo "═══════════════════════════════════════"
echo "  Deploy complete!"
echo "═══════════════════════════════════════"
echo ""
echo "  To check logs:"
echo "    ssh -p ${REMOTE_PORT} ${SSH_TARGET} 'docker compose -f ${COMPOSE_FILE} logs -f --tail=50'"
echo ""
