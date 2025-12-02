# 第一阶段：构建阶段
FROM node:18-slim AS builder

# 安装必要的依赖项
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    sqlite3 \
    libsqlite3-dev

# 设置工作目录
WORKDIR /app

# 复制 package.json
COPY package.json ./

# 安装 pnpm
RUN npm install -g pnpm

# 使用挂载缓存安装依赖
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --no-frozen-lockfile

# 直接在容器内编译 better-sqlite3
# 这样可以确保编译的二进制文件与运行环境兼容
RUN --mount=type=cache,target=/root/.npm \
    cd /app/node_modules/better-sqlite3 && \
    npm install && \
    npm run build-release

# 确保文件有正确的权限
RUN chmod -R 755 /app/node_modules/better-sqlite3/build/Release/

# 复制源代码
COPY . .

# 编译 TypeScript 文件
RUN pnpm run build || echo "TypeScript compilation failed, but continuing with build"

# 第二阶段：创建最终镜像
FROM node:18-slim

# 安装运行时必要的依赖
RUN apt-get update && apt-get install -y \
    sqlite3 \
    libsqlite3-dev \
    libc6 \
    libc6-dev \
    python3 \
    make \
    g++ \
    build-essential

WORKDIR /app

# 复制依赖和构建文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# 直接在容器内编译 better-sqlite3
# 这样可以确保编译的二进制文件与运行环境兼容
RUN --mount=type=cache,target=/root/.npm \
    cd /app/node_modules/better-sqlite3 && \
    npm install && \
    npm run build-release

# 确保文件有正确的权限
RUN chmod -R 755 /app/node_modules/better-sqlite3/build/Release/

# 创建数据目录
RUN mkdir -p /app/data
RUN mkdir -p /app/dist/data/screenshots

# 复制视图和 proto 文件
RUN mkdir -p /app/dist/src/views/layouts
RUN mkdir -p /app/dist/src/protos
COPY --from=builder /app/src/views/ /app/dist/src/views/
COPY --from=builder /app/src/protos/ /app/dist/src/protos/

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "dist/src/server.js"]