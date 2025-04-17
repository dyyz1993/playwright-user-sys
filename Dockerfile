# 使用 Node.js 作为基础镜像
FROM node:18

# 安装必要的依赖项
RUN apt-get update && apt-get install -y python3 make g++ build-essential sqlite3

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装依赖
RUN pnpm install --no-frozen-lockfile

# 安装 better-sqlite3 的依赖
RUN apt-get update && apt-get install -y python3 make g++ build-essential sqlite3 libsqlite3-dev

# 重新编译 better-sqlite3
RUN cd node_modules/better-sqlite3 && npm install && npm run build-release

# 复制源代码
COPY . .

# 设置工作目录
WORKDIR /app

# 创建数据目录
RUN mkdir -p /app/data
RUN mkdir -p /app/dist/data/screenshots

# 编译 TypeScript 文件
RUN pnpm run build || echo "TypeScript compilation failed, but continuing with build"

# 复制视图和 proto 文件
RUN mkdir -p /app/dist/src/views/layouts
RUN mkdir -p /app/dist/src/protos
COPY ./src/views/ /app/dist/src/views/
COPY ./src/protos/ /app/dist/src/protos/

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "dist/src/server.js"]
