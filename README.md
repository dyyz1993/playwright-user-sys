# Playwright 用户管理系统

一个用于管理 Playwright 实例的系统，包含用户管理、点数计费和实例集群管理功能。

## 系统架构

系统由以下三个主要部分组成：

1. **管理服务器**：提供 API 和管理界面，负责用户管理、点数计费和实例分配。

2. **实例机器**：运行 Playwright 实例，可以部署多台实例机器组成集群。

3. **用户端 SDK**：提供给用户使用的客户端库，用于创建和管理 Playwright 会话。

系统工作流程：

1. 用户通过 SDK 创建会话并获取 sessionId
2. 管理服务器在可用的实例机器上启动 Playwright 实例
3. 用户通过 WebSocket 连接到 Playwright 实例
4. 管理服务器计算使用时长并扣除点数

## 功能特点

- 管理员和普通用户角色区分
- 用户点数计费系统
- 实例机器集群管理
- WebSocket 代理连接
- Webhook 事件通知
- API 文档（Swagger 和 Scalar）
- Docker 部署支持
- SQLite/MySQL 数据库支持
- 文件上传和管理功能
- CDP 文件上传支持
- 分布式文件上传支持

## 技术栈

- TypeScript
- Fastify
- Knex.js (SQL 查询构建器)
- SQLite/MySQL
- Playwright
- WebSocket
- Docker

## 快速开始

### 环境要求

- Node.js 18+
- pnpm 8+
- SQLite 或 MySQL

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/playwright-user-sys.git
cd playwright-user-sys

# 安装依赖
pnpm install

# 复制环境变量配置
cp .env.example .env
```

### 开发

```bash
# 启动开发服务器
pnpm dev
```

### 构建

```bash
# 构建生产版本
pnpm build

# 启动生产服务器
pnpm start
```

### 实例机器

```bash
# 启动实例机器开发服务器
pnpm dev:machine

# 构建并启动实例机器生产服务器
pnpm build
pnpm start:machine
```

### Docker 部署

```bash
# 仅部署管理服务器
docker-compose up -d

# 部署完整系统（管理服务器 + 实例机器）
docker-compose -f docker-compose.full.yml up -d
```

### Chrome 文件配置

对于实例机器（Dockerfile.machine），需要提供Chrome浏览器文件。有两种方式：

1. **使用卷映射（推荐）**：

```bash
# 准备Chrome文件目录
mkdir -p ./chrome
# 将Chrome浏览器文件复制到chrome目录，确保包含chrome可执行文件

# 运行容器时映射Chrome目录
docker run -d \
  --name playwright-machine \
  -v /path/to/your/chrome:/opt/chrome \
  -e MANAGEMENT_SERVER_URL=http://your-management-server:3000 \
  -p 8082:8082 \
  your-registry/playwright-user-sys:machine
```

2. **使用Docker Compose**：

```yaml
version: '3.8'
services:
  machine:
    image: your-registry/playwright-user-sys:machine
    volumes:
      - ./chrome:/opt/chrome:ro  # 只读映射Chrome目录
    environment:
      - MANAGEMENT_SERVER_URL=http://manager:3000
    ports:
      - "8082:8082"
```

**注意**：
- Chrome目录必须包含名为`chrome`的可执行文件
- 如果没有提供Chrome文件，容器启动时会显示警告并在30秒后退出
- 推荐使用官方Chrome或Chromium浏览器的稳定版本

## API 文档

启动服务器后，可以通过以下地址访问 API 文档：

- Swagger UI: http://localhost:3000/docs
- Scalar API 参考: http://localhost:3000/reference

## 文件上传功能

系统支持文件上传功能，管理员可以通过以下方式上传和管理文件：

### 通过管理界面上传

1. 登录管理后台
2. 点击左侧菜单的"文件上传"
3. 选择要上传的文件
4. 点击"上传文件"按钮

### 通过 API 上传

```bash
# 使用 curl 上传文件
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "file=@/path/to/your/file.txt"
```

### 访问上传的文件

上传的文件可以通过以下 URL 访问：
```
http://localhost:3000/uploads/filename.ext
```

## CDP 文件上传支持

当在云端部署浏览器实例时，本地文件上传需要特殊处理。系统提供了专门的机制来支持通过 Chrome DevTools Protocol (CDP) 进行文件上传：

### 工作原理

1. **文件上传**：本地文件首先通过 API 上传到云端服务器的临时目录
2. **路径映射**：服务器返回文件在云端的绝对路径
3. **CDP 操作**：使用 CDP 的 `DOM.setFileInputFiles` 方法设置文件输入
4. **文件访问**：云端浏览器可以直接访问服务器上的文件

### 使用示例

```javascript
// 1. 上传本地文件到服务器
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const uploadResponse = await fetch('/api/files/upload-temp', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
});

const uploadData = await uploadResponse.json();
const serverFilePath = uploadData.data.filepath;

// 2. 使用 CDP 设置文件输入
const cdp = await page.target().createCDPSession();
await cdp.send('DOM.setFileInputFiles', {
  objectId: fileInputElementId,
  files: [serverFilePath]  // 服务器上的文件路径
});
```

### API 端点

- `POST /api/files/upload-temp` - 上传临时文件用于 CDP 操作
- `POST /api/files/cleanup-temp` - 清理临时文件

## 分布式文件上传支持

在分布式架构中，管理端和机器端运行在不同的物理机器上。传统的文件上传方式在这种架构下无法正常工作，因为文件存储在管理端机器上，机器端无法直接访问。

系统提供了通过 WebSocket 直接将文件从客户端传输到机器端的解决方案：

### 工作原理

1. **直接传输**：客户端通过 WebSocket 将文件直接传输到机器端
2. **本地存储**：机器端将文件存储在本地临时目录
3. **CDP 操作**：使用 CDP 的 `DOM.setFileInputFiles` 方法设置文件输入
4. **无需管理端**：完全绕过管理端的文件存储

### 使用示例

```javascript
import DistributedFileUploader from './examples/complete-distributed-file-upload.js';

// 1. 连接到机器端
const uploader = new DistributedFileUploader('ws://machine-endpoint:8082');
await uploader.connect();

// 2. 创建会话
await uploader.createSession();

// 3. 上传文件（直接传输到机器端）
const uploadResult = await uploader.uploadFile('./local-file.txt', 'remote-file.txt');

// 4. 设置文件输入（可选）
await uploader.setFileInput('input[type="file"]', uploadResult.filepath);

// 5. 关闭会话
await uploader.closeSession();
```

详细文档请参考 [分布式文件上传文档](./docs/distributed-file-upload.md)

## 测试

系统包含了一系列测试脚本，位于 `tests` 目录下：

```bash
# 测试登录流程
pnpm test:login

# 测试会话管理
pnpm test:sessions

# 测试点数管理
pnpm test:credits

# 完整 API 测试
pnpm test:api

# 运行所有测试
pnpm test:all
```