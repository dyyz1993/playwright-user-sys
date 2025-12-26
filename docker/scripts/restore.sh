#!/bin/bash
# Docker Environment Restore Script
# Usage: ./restore.sh <backup_date>

set -e

# Configuration
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check arguments
if [ -z "$1" ]; then
    log_error "Usage: $0 <backup_date>"
    echo ""
    echo "Available backups:"
    ls -1 "$BACKUP_DIR" | grep -E 'mysql_[0-9]{8}_[0-9]{6}\.sql\.gz$' | sed 's/mysql_\([0-9_]*\)\.sql\.gz/\1/'
    exit 1
fi

BACKUP_DATE=$1
MYSQL_BACKUP="$BACKUP_DIR/mysql_${BACKUP_DATE}.sql.gz"

# Verify backup exists
if [ ! -f "$MYSQL_BACKUP" ]; then
    log_error "Backup not found: $MYSQL_BACKUP"
    exit 1
fi

# Source environment variables
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    log_error "Environment file not found: $ENV_FILE"
    exit 1
fi

# Warning
log_warn "This will restore the database from backup: $BACKUP_DATE"
log_warn "All current data will be replaced!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    log_info "Restore cancelled"
    exit 0
fi

# Restore MySQL
log_info "Restoring MySQL database..."
MYSQL_CONTAINER="playwright-mysql-prod"

if docker ps | grep -q "$MYSQL_CONTAINER"; then
    # Decompress and restore
    gunzip -c "$MYSQL_BACKUP" | \
        docker exec -i "$MYSQL_CONTAINER" \
        mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE:-playwright_user_sys}"

    log_info "MySQL database restored successfully"
else
    log_error "MySQL container not running"
    exit 1
fi

# Optional: Restore files volume
FILES_BACKUP="$BACKUP_DIR/files_${BACKUP_DATE}.tar.gz"
if [ -f "$FILES_BACKUP" ]; then
    log_info "Restoring files volume..."
    docker run --rm \
        -v playwright-manager-prod-files:/data \
        -v "$(pwd)/$BACKUP_DIR:/backup" \
        alpine sh -c "tar xzf /backup/files_${BACKUP_DATE}.tar.gz -C /data"

    log_info "Files volume restored successfully"
else
    log_warn "Files backup not found: $FILES_BACKUP"
fi

log_info "Restore completed successfully!"
log_warn "Please restart services to ensure all changes take effect"
