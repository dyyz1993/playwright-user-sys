# Docker Configuration

This directory contains all Docker-related configuration files for the Playwright User Management System.

## Directory Structure

```
docker/
├── manager/
│   └── Dockerfile              # Management server image
├── machine/
│   └── Dockerfile              # Machine service image
├── mysql/
│   ├── my.cnf                  # MySQL configuration
│   └── init/                   # Database initialization scripts
├── nginx/
│   ├── nginx.conf              # Nginx main configuration
│   └── conf.d/
│       └── default.conf        # Site configuration
├── .dockerignore               # Docker ignore rules
├── .env.example                # Environment variables template
├── docker-compose.dev.yml      # Development environment
├── docker-compose.prod.yml     # Production environment
└── README.md                   # This file
```

## Quick Start

### Development

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop services
docker-compose -f docker-compose.dev.yml down
```

### Production

```bash
# Configure environment
cp .env.example .env
vim .env  # Edit configuration

# Start production environment
docker-compose -f docker-compose.prod.yml --env-file .env up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
```

## Images

### Management Server

- **Base Image**: node:22-alpine
- **Size**: ~200MB (optimized)
- **Ports**: 3000 (HTTP), 50051 (gRPC)

### Machine Service

- **Base Image**: node:22-alpine
- **Size**: ~500MB (includes Playwright and Chromium)
- **Ports**: 50052 (gRPC), 8082 (WebSocket Proxy)

## Services

| Service | Description | Ports |
|---------|-------------|-------|
| nginx | Reverse proxy (optional) | 80, 443 |
| manager | Management server | 3000, 50051 |
| machine-1 | Browser service 1 | 50052, 8082 |
| machine-2 | Browser service 2 (optional) | 50053, 8083 |
| mysql | Database | 3306 |

## Configuration

See [Docker构建与部署指南.md](../docs/开发/Docker构建与部署指南.md) for detailed documentation.

## Environment Variables

Key environment variables (see `.env.example`):

- `MYSQL_ROOT_PASSWORD`: MySQL root password
- `JWT_SECRET`: JWT signing secret
- `ADMIN_PASSWORD`: Admin user password
- `MAX_SESSIONS`: Maximum sessions per machine

## Health Checks

All services include health checks:

```bash
# Check health status
docker ps
docker inspect <container> | grep -A 10 Health

# Manual health check
curl http://localhost:3000/api/health
```

## Build Images

```bash
# Build management server
docker build -f manager/Dockerfile -t playwright-manager:latest ../

# Build machine service
docker build -f machine/Dockerfile -t playwright-machine:latest ../

# Build with specific version
docker build -f manager/Dockerfile -t playwright-manager:v1.0.0 ../
```

## Scaling

### Horizontal Scaling (Add Machines)

```bash
# Start second machine
docker-compose -f docker-compose.prod.yml --profile scaling up -d machine-2

# Add more machines (create additional service in docker-compose)
```

### Vertical Scaling (Resource Limits)

Edit `.env`:

```bash
MACHINE_CPU_LIMIT=8
MACHINE_MEMORY_LIMIT=8G
MAX_SESSIONS=20
```

Then restart:

```bash
docker-compose -f docker-compose.prod.yml up -d machine-1
```

## Monitoring

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f manager

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100
```

### Resource Usage

```bash
# Real-time stats
docker stats

# Single view
docker stats --no-stream
```

## Backup

### Database Backup

```bash
docker exec playwright-mysql-prod \
  mysqldump -u root -p${MYSQL_ROOT_PASSWORD} \
  playwright_user_sys > backup-$(date +%Y%m%d).sql
```

### Volume Backup

```bash
docker run --rm \
  -v playwright-manager-prod-files:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/files-backup-$(date +%Y%m%d).tar.gz -C /data .
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs <container>

# Check configuration
docker inspect <container>

# Enter container
docker exec -it <container> sh
```

### Network Issues

```bash
# Check network
docker network inspect playwright-prod-network

# Test connectivity
docker exec <container> ping <other-container>
```

### Database Connection

```bash
# Check MySQL
docker logs playwright-mysql-prod

# Test from manager
docker exec playwright-manager-prod nc -zv mysql 3306
```

## Production Deployment Checklist

- [ ] Change all default passwords
- [ ] Set strong JWT_SECRET
- [ ] Configure resource limits
- [ ] Enable HTTPS (use Nginx)
- [ ] Set up backups
- [ ] Configure log rotation
- [ ] Set up monitoring
- [ ] Test failover procedures
- [ ] Document disaster recovery

## Support

For detailed documentation, see:
- [Docker构建与部署指南.md](../docs/开发/Docker构建与部署指南.md)
- [项目启动与验证指南.md](../docs/开发/项目启动与验证指南.md)
- [architecture-improvement.md](../architecture-improvement.md)
