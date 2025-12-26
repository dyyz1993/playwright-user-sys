# Docker Architecture Diagrams

## Docker Compose Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Host Machine (Docker Host)                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                   playwright-prod-network                           │ │
│  │                      (Bridge Network)                              │ │
│  │                                                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │ │
│  │  │              │  │              │  │              │           │ │
│  │  │    nginx     │  │   manager    │  │  machine-1   │           │ │
│  │  │              │  │              │  │              │           │ │
│  │  │ Port: 80     │  │ Port: 3000   │  │ Port: 50052  │           │ │
│  │  │       443    │  │       50051  │  │       8082   │           │ │
│  │  │              │  │              │  │              │           │ │
│  │  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │           │ │
│  │  │ │ Nginx    │ │  │ │ Manager  │ │  │ │ Machine  │ │           │ │
│  │  │ │ :alpine  │ │  │ │ Node.js  │ │  │ │ Playwright│ │           │ │
│  │  │ │          │ │  │ │ 22-alpine│ │  │ │ +Chromium│ │           │ │
│  │  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │           │ │
│  │  │              │  │              │  │              │           │ │
│  │  │ Volume:      │  │ Volume:      │  │ Volume:      │           │ │
│  │  │ nginx-logs   │  │ manager-data │  │ machine-data │           │ │
│  │  └──────────────┘  └──────┬───────┘  └──────┬───────┘           │ │
│  │                            │                   │                  │ │
│  │                            │ gRPC              │                  │ │
│  │                            ▼                   │                  │ │
│  │                   ┌──────────────┐             │                  │ │
│  │                   │              │             │                  │ │
│  │                   │    mysql     │◄────────────┘                  │ │
│  │                   │              │                                │ │
│  │                   │ Port: 3306   │                                │ │
│  │                   │              │                                │ │
│  │                   │ ┌──────────┐ │                                │ │
│  │                   │ │ MySQL 8.0│ │                                │ │
│  │                   │ └──────────┘ │                                │ │
│  │                   │              │                                │ │
│  │                   │ Volume:      │                                │ │
│  │                   │ mysql-data   │                                │ │
│  │                   └──────────────┘                                │ │
│  │                                                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  External Access:                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Internet                                                        │   │
│  │     │                                                            │   │
│  │     │ HTTPS (443)                                               │   │
│  │     ▼                                                            │   │
│  │  ┌──────────────┐                                               │   │
│  │  │    nginx     │ ───► Reverse Proxy                            │   │
│  │  │              │                                               │   │
│  │  └──────────────┘                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Multi-Stage Build Architecture

### Management Server Build

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Management Server Multi-Stage Build                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Stage 1: dependencies                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ FROM node:22-alpine                                             │   │
│  │                                                                  │   │
│  │ Actions:                                                         │   │
│  │  ├─ Install build tools (python3, make, g++)                    │   │
│  │  ├─ Copy package.json & pnpm-lock.yaml                         │   │
│  │  └─ Install dependencies with pnpm                              │   │
│  │                                                                  │   │
│  │ Output: /app/node_modules (with all dependencies)               │   │
│  │ Size: ~800MB                                                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                         │
│                              ▼                                         │
│  Stage 2: build                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ FROM node:22-alpine                                             │   │
│  │                                                                  │   │
│  │ Actions:                                                         │   │
│  │  ├─ Copy node_modules from Stage 1                             │   │
│  │  ├─ Copy all source code                                        │   │
│  │  ├─ Setup TypeScript path mappings                              │   │
│  │  └─ Build TypeScript (tsc)                                      │   │
│  │                                                                  │   │
│  │ Output: /app/dist (compiled JavaScript)                         │   │
│  │ Size: ~1.2GB                                                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                         │
│                              ▼                                         │
│  Stage 3: production                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ FROM node:22-alpine                                             │   │
│  │                                                                  │   │
│  │ Actions:                                                         │   │
│  │  ├─ Install runtime dependencies only (sqlite)                  │   │
│  │  ├─ Create non-root user (nodejs:1001)                          │   │
│  │  ├─ Copy node_modules and dist from Stage 2                    │   │
│  │  ├─ Setup data directories                                      │   │
│  │  ├─ Copy proto files                                            │   │
│  │  └─ Configure health check                                       │   │
│  │                                                                  │   │
│  │ Output: Optimized production image                              │   │
│  │ Size: ~200MB                                                     │   │
│  │ User: nodejs (1001:1001)                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Machine Service Build

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Machine Service Multi-Stage Build                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Stage 1: dependencies (same as Manager)                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ FROM node:22-alpine                                             │   │
│  │ Install build dependencies and npm packages                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                         │
│                              ▼                                         │
│  Stage 2: build (same as Manager)                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ FROM node:22-alpine                                             │   │
│  │ Build TypeScript source code                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                         │
│                              ▼                                         │
│  Stage 3: production (with Playwright)                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ FROM node:22-alpine                                             │   │
│  │                                                                  │   │
│  │ Actions:                                                         │   │
│  │  ├─ Install Playwright dependencies (many libraries)            │   │
│  │  ├─ Install fonts for rendering                                 │   │
│  │  ├─ Install Xvfb for headless display                           │   │
│  │  ├─ Install Chromium via Playwright                             │   │
│  │  ├─ Create non-root user                                        │   │
│  │  ├─ Copy application files                                      │   │
│  │  ├─ Create startup script (Xvfb + dbus + app)                   │   │
│  │  └─ Configure health check                                       │   │
│  │                                                                  │   │
│  │ Output: Production image with Playwright + Chromium             │   │
│  │ Size: ~500MB                                                     │   │
│  │ Includes:                                                       │   │
│  │  - Node.js runtime                                             │   │
│  │  - Chromium browser                                             │   │
│  │  - Playwright libraries                                         │   │
│  │  - Xvfb (virtual display)                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Service Communication Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Service Communication                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Client Request Flow:                                                    │
│  ┌──────────┐                                                          │
│  │  Client  │                                                          │
│  │  (User)  │                                                          │
│  └────┬─────┘                                                          │
│       │                                                                 │
│       │ 1. HTTPS Request                                               │
│       ▼                                                                 │
│  ┌──────────┐                                                          │
│  │  Nginx   │ ──► Terminates SSL                                       │
│  │  :80/443 │     Routes to Manager                                    │
│  └────┬─────┘                                                          │
│       │                                                                 │
│       │ 2. HTTP Proxy                                                   │
│       ▼                                                                 │
│  ┌──────────────┐                                                      │
│  │   Manager    │                                                      │
│  │   :3000      │                                                      │
│  │              │                                                      │
│  │  ┌────────┐  │                                                      │
│  │  │  API   │  │                                                      │
│  │  │  Auth  │  │                                                      │
│  │  │  DB    │  │                                                      │
│  │  └───┬────┘  │                                                      │
│  └──────┼────────┘                                                      │
│         │                                                                │
│         │ 3. gRPC Allocate Session                                      │
│         ▼                                                                │
│  ┌──────────────┐                                                      │
│  │  machine-1   │                                                      │
│  │  :50052/8082 │                                                      │
│  │              │                                                      │
│  │  ┌────────┐  │                                                      │
│  │  │ gRPC   │  │                                                      │
│  │  │ Server │  │                                                      │
│  │  └───┬────┘  │                                                      │
│  │      │       │                                                      │
│  │      ▼       │                                                      │
│  │  ┌────────┐  │                                                      │
│  │  │Browser │  │                                                      │
│  │  │Session │  │                                                      │
│  │  └───┬────┘  │                                                      │
│  └──────┼────────┘                                                      │
│         │                                                                │
│         │ 4. WebSocket Proxy URL                                        │
│         ▼                                                                │
│  ┌──────────┐                                                          │
│  │  Client  │ ──► WebSocket Connection ──► Browser                      │
│  └──────────┘       (via machine:8082)                                  │
│                                                                          │
│  Database Flow:                                                         │
│  ┌──────────┐     ┌──────────┐                                         │
│  │ Manager  │────▶│  MySQL   │                                         │
│  │ machine-*│     │  :3306   │                                         │
│  └──────────┘     └──────────┘                                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Volume and Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Data Persistence                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Volumes (Docker):                                                       │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  mysql-prod-data                                                  │  │
│  │  ├─ /var/lib/mysql                                              │  │
│  │  │  ├─ playwright_user_sys (database)                            │  │
│  │  │  │  ├─ users                                                 │  │
│  │  │  │  ├─ machines                                              │  │
│  │  │  │  ├─ sessions                                              │  │
│  │  │  │  └─ operation_logs                                        │  │
│  │  │  └─ mysql-bin.* (binary logs)                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ▲                                           │
│                              │                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  manager-prod-data                                               │  │
│  │  └─ /app/data                                                   │  │
│  │     ├─ db.sqlite (if SQLite used)                               │  │
│  │     └─ temp/                                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  manager-prod-files                                              │  │
│  │  └─ /app/files                                                  │  │
│  │     ├─ uploads/                                                  │  │
│  │     └─ userfiles/                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  machine-1-prod-data                                             │  │
│  │  └─ /app/data                                                   │  │
│  │     ├─ cache/                                                    │  │
│  │     └─ state/                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  machine-*-screenshots                                            │  │
│  │  └─ /app/dist/data/screenshots                                   │  │
│  │     ├─ session-1/                                                │  │
│  │     ├─ session-2/                                                │  │
│  │     └─ ...                                                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Backup Flow:                                                           │
│  ┌──────────────┐     backup.sh     ┌────────────────────────────────┐ │
│  │   Running    │ ────────────────▶ │  ./backups/                   │ │
│  │  Containers  │                  │  ├─ mysql_20241226.sql.gz     │ │
│  └──────────────┘                  │  ├─ files_20241226.tar.gz     │ │
│                                    │  └─ volume_mysql_*.tar.gz     │ │
│                                    └────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Development vs Production Comparison

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Development vs Production                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Development Environment (docker-compose.dev.yml):                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Target Stage: dependencies (keeps dev tools)                     │ │
│  │  Source Mount:  ..:/app (cached)                                  │ │
│  │  Node Modules:  Separate volume (prevents overwrite)              │ │
│  │  Command:       pnpm dev:server (tsx watch for hot-reload)        │ │
│  │  Database:      SQLite or MySQL                                   │ │
│  │  Logging:       Verbose debug output                             │ │
│  │  Restart:       On failure only                                   │ │
│  │  Resource Limit: None                                             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Production Environment (docker-compose.prod.yml):                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Target Stage:  production (optimized, minimal)                   │ │
│  │  Source Mount:  None (code baked into image)                      │ │
│  │  Node Modules:  In image (production build)                       │ │
│  │  Command:       node dist/manager/server.js                       │ │
│  │  Database:      MySQL only                                        │ │
│  │  Logging:       JSON format, 10MB rotation                        │ │
│  │  Restart:       Always                                            │ │
│  │  Resource Limit: CPU + Memory limits set                          │ │
│  │  Health Check:  Enabled with retries                              │ │
│  │  User:          nodejs (non-root)                                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Security Layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Security Architecture                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Layer 1: Network Isolation                                              │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Internal Network: 172.20.0.0/16                                  │ │
│  │  └─ Only nginx exposes ports (80, 443) to host                    │ │
│  │  └─ Manager gRPC (50051) not exposed                              │ │
│  │  └─ MySQL (3306) not exposed                                      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  Layer 2: Reverse Proxy (Nginx)                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  SSL/TLS Termination                                              │ │
│  │  └─ Port 443: HTTPS only                                          │ │
│  │  └─ Port 80: Redirect to HTTPS                                    │ │
│  │                                                                  │ │
│  │  Rate Limiting                                                    │ │
│  │  └─ 10 req/s per IP                                              │ │
│  │                                                                  │ │
│  │  Request Size Limit                                               │ │
│  │  └─ Max 100MB for file uploads                                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  Layer 3: Application Security (Manager)                                │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  JWT Authentication                                               │ │
│  │  └─ Token validation on all API routes                            │ │
│  │                                                                  │ │
│  │  Role-Based Access Control                                       │ │
│  │  └─ admin, user roles                                            │ │
│  │                                                                  │ │
│  │  Input Validation                                                │ │
│  │  └─ Zod schema validation                                        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  Layer 4: Container Security                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Non-Root User                                                    │ │
│  │  └─ UID:GID 1001:1001                                            │ │
│  │                                                                  │ │
│  │  Read-Only Filesystem (optional)                                  │ │
│  │  └─ Only /data and /tmp writable                                 │ │
│  │                                                                  │ │
│  │  Dropped Capabilities                                             │ │
│  │  └─ Minimal Linux capabilities                                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  Layer 5: Data Security                                                │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  MySQL                                                            │ │
│  │  └─ Password authentication                                      │ │
│  │  └─ Encrypted connections (optional)                             │ │
│  │                                                                  │ │
│  │  Secrets Management                                               │ │
│  │  └─ Environment variables (not in image)                         │ │
│  │  └─ .env file never committed to git                             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
