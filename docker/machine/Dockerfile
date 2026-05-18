# Machine Service Dockerfile
# Multi-stage build for Playwright browser service

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS dependencies

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm
RUN npm install -g pnpm@10.8.0

# Install dependencies
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build
# ============================================
FROM node:22-alpine AS build

WORKDIR /app

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Setup and build (generate dist directory)
RUN npm install -g pnpm@10.8.0
RUN pnpm setup:aliases || true
RUN pnpm build:emit

# ============================================
# Stage 3: Production with Playwright
# ============================================
FROM node:22-alpine AS production

# Install all runtime dependencies for Playwright
RUN apk add --no-cache \
    # Basic libraries
    libc6-compat \
    curl \
    # Playwright browser dependencies
    libasound \
    libatk-1.0 \
    libatk-bridge-2.0 \
    libcairo \
    libcups \
    libdrm \
    libepoxy \
    libgbm \
    libgdk-pixbuf-2.0 \
    libxkbcommon \
    libpango-1.0 \
    libthai \
    libxcomposite \
    libxdamage \
    libxfixes \
    libxkbcommon-x11 \
    libxrandr \
    # Fonts for rendering
    ttf-liberation \
    ttf-dejavu \
    ttf-droid \
    ttf-freefont \
    # X11 and display
    xvfb \
    dbus \
    # Additional utilities
    wget \
    ca-certificates

# Install Chromium via Playwright
RUN npx playwright install-deps chromium
RUN npx playwright install chromium

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy application files
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/package.json ./

# Create directories
RUN mkdir -p /app/data \
    /app/dist/data/screenshots \
    /app/dist/src/shared/protos && \
    chown -R nodejs:nodejs /app

# Copy proto files
COPY --chown=nodejs:nodejs src/shared/protos ./dist/src/shared/protos

# Create startup script
RUN cat > /app/entrypoint.sh << 'EOF'
#!/bin/sh
set -e

# Handle SIGTERM and SIGINT
trap 'exit 0' TERM INT

echo "Starting Machine Service..."
echo "Machine ID: ${MACHINE_ID}"
echo "Manager Host: ${MANAGER_HOST}"

# Start Xvfb for headless display
echo "Starting Xvfb..."
Xvfb :99 -screen 0 1920x1080x24 -ac +render -noreset &
export DISPLAY=:99

# Wait for Xvfb to be ready
sleep 2

# Start dbus
echo "Starting dbus..."
dbus-daemon --session --address=unix:path=/tmp/dbus-session-bus --fork

# Health check endpoint
health_check() {
    while true; do
        sleep 30
        # Basic health check - can be expanded
        :
    done
}

health_check &

# Start the machine service
echo "Starting machine server..."
exec node dist/machine/server.js
EOF

RUN chmod +x /app/entrypoint.sh && \
    chown nodejs:nodejs /app/entrypoint.sh

# Set environment variables
ENV NODE_ENV=production \
    DISPLAY=:99 \
    PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

# Switch to non-root user
USER nodejs

# Expose ports
# 50052: gRPC
# 8082: WebSocket Proxy
# 9100: Health check HTTP
EXPOSE 50052 8082 9100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${MACHINE_HEALTH_PORT:-9100}/health || exit 1

# Start service
ENTRYPOINT ["/app/entrypoint.sh"]
