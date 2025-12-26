#!/bin/bash
# Docker Environment Backup Script
# Usage: ./backup.sh

set -e

# Configuration
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directory
mkdir -p "$BACKUP_DIR"

log_info "Starting backup at $DATE"

# Source environment variables
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    log_error "Environment file not found: $ENV_FILE"
    exit 1
fi

# Backup MySQL
log_info "Backing up MySQL database..."
MYSQL_CONTAINER="playwright-mysql-prod"

if docker ps | grep -q "$MYSQL_CONTAINER"; then
    docker exec "$MYSQL_CONTAINER" \
        mysqldump -u root -p"${MYSQL_ROOT_PASSWORD}" \
        --single-transaction \
        --quick \
        --lock-tables=false \
        "${MYSQL_DATABASE:-playwright_user_sys}" \
        > "$BACKUP_DIR/mysql_${DATE}.sql"

    # Compress backup
    gzip "$BACKUP_DIR/mysql_${DATE}.sql"
    log_info "MySQL backup completed: mysql_${DATE}.sql.gz"
else
    log_warn "MySQL container not running, skipping database backup"
fi

# Backup files volume
log_info "Backing up files volume..."
docker run --rm \
    -v playwright-manager-prod-files:/data:ro \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    alpine tar czf "/backup/files_${DATE}.tar.gz" -C /data .

log_info "Files backup completed: files_${DATE}.tar.gz"

# Backup MySQL volume
log_info "Backing up MySQL data volume..."
docker run --rm \
    -v playwright-prod-mysql-data:/data:ro \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    alpine tar czf "/backup/volume_mysql_${DATE}.tar.gz" -C /data .

log_info "MySQL volume backup completed: volume_mysql_${DATE}.tar.gz"

# Cleanup old backups (keep last 7 days)
log_info "Cleaning up old backups (keeping last 7 days)..."
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +7 -delete 2>/dev/null || true
find "$BACKUP_DIR" -type f -name "*.tar.gz" -mtime +7 -delete 2>/dev/null || true

# Display backup summary
log_info "Backup completed successfully!"
echo ""
echo "Backup files created:"
ls -lh "$BACKUP_DIR" | grep "$DATE" || true
echo ""
echo "Total size of backups:"
du -sh "$BACKUP_DIR"
