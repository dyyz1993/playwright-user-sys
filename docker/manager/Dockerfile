# Management Server Dockerfile
# Multi-stage build for optimized image size

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS dependencies

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite-dev \
    libc6-compat

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm
RUN npm install -g pnpm@10.8.0

# Install dependencies with caching
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build
# ============================================
FROM node:22-alpine AS build

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Setup TypeScript path mappings
RUN npm install -g pnpm@10.8.0
RUN pnpm setup:aliases || true

# Build TypeScript
RUN pnpm build

# ============================================
# Stage 3: Production
# ============================================
FROM node:22-alpine AS production

# Install runtime dependencies only
RUN apk add --no-cache \
    sqlite \
    sqlite-libs \
    libc6-compat \
    curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy necessary files from build stage
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/package.json ./

# Create necessary directories
RUN mkdir -p /app/data \
    /app/dist/data/screenshots \
    /app/dist/src/shared/protos \
    /app/files && \
    chown -R nodejs:nodejs /app

# Copy proto files
COPY --chown=nodejs:nodejs src/shared/protos ./dist/src/shared/protos

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Switch to non-root user
USER nodejs

# Expose ports
# 3000: HTTP API
# 50051: gRPC
EXPOSE 3000 50051

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/manager/server.js"]
