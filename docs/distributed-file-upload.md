# 分布式文件上传解决方案

## 概述

在分布式架构中，管理端和机器端运行在不同的物理机器上。传统的文件上传方式（管理端上传文件到服务器，然后机器端访问）在这种架构下无法正常工作，因为文件存储在管理端机器上，机器端无法直接访问。

本文档介绍了一种通过WebSocket直接将文件从客户端传输到机器端的解决方案，完全绕过管理端的文件存储。

## 架构说明

```
┌─────────────┐    WebSocket    ┌─────────────┐
│   客户端    │◄───────────────►│   机器端    │
│ (本地浏览器) │                │ (运行浏览器) │
└─────────────┘                └─────────────┘
       ▲                               ▲
       │                               │
       │                               │
       ▼                               ▼
┌─────────────┐                ┌─────────────┐
│   管理端    │                │   浏览器    │
│ (Web管理界面)│                │  (Puppeteer)│
└─────────────┘                └─────────────┘
```

## 解决方案

### 1. 直接数据传输方案

通过WebSocket将文件数据直接从客户端传输到机器端，然后使用CDP命令设置文件输入。

#### 工作流程：

1. 客户端通过WebSocket连接到机器端
2. 客户端将文件分块传输到机器端
3. 机器端接收文件块并保存到临时目录
4. 机器端使用CDP的`DOM.setFileInputFiles`命令设置文件路径

### 2. 文件传输协议

#### 2.1 开始文件上传

客户端发送文件上传开始消息：

```json
{
  "type": "fileUploadStart",
  "sessionId": "session-id",
  "data": {
    "filename": "example.txt",
    "size": 1024000,
    "totalChunks": 2
  }
}
```

机器端响应：

```json
{
  "type": "response",
  "requestType": "fileUploadStart",
  "data": {
    "success": true,
    "filepath": "/path/to/temp/session-id/123456789-example.txt",
    "filename": "example.txt",
    "size": 1024000
  }
}
```

#### 2.2 传输文件块

客户端发送文件块：

```json
{
  "type": "fileUploadChunk",
  "sessionId": "session-id",
  "data": {
    "chunkIndex": 0,
    "chunk": "base64-encoded-chunk-data",
    "isLast": false
  }
}
```

机器端响应：

```json
{
  "type": "response",
  "requestType": "fileUploadChunk",
  "data": {
    "success": true,
    "chunkIndex": 0
  }
}
```

#### 2.3 最后一个文件块

```json
{
  "type": "fileUploadChunk",
  "sessionId": "session-id",
  "data": {
    "chunkIndex": 1,
    "chunk": "base64-encoded-chunk-data",
    "isLast": true
  }
}
```

## 使用示例

### 客户端代码示例

```javascript
import DistributedFileUploader from './examples/complete-distributed-file-upload.js';

async function uploadFileExample() {
  // 连接到机器端
  const uploader = new DistributedFileUploader('ws://machine-endpoint:8082');
  await uploader.connect();
  
  // 创建会话
  await uploader.createSession();
  
  // 上传文件
  const uploadResult = await uploader.uploadFile('./local-file.txt', 'remote-file.txt');
  
  // 设置文件输入（可选）
  await uploader.setFileInput('input[type="file"]', uploadResult.filepath);
  
  // 关闭会话
  await uploader.closeSession();
}
```

## 实现细节

### 机器端实现

1. **文件存储位置**：文件存储在机器端的临时目录中，路径为`[tempDir]/[sessionId]/[unique-filename]`
2. **分块传输**：支持大文件分块传输，避免内存问题
3. **状态管理**：在会话配置中维护文件上传状态

### 安全考虑

1. **文件路径安全**：生成唯一文件名，防止路径遍历攻击
2. **会话隔离**：每个会话的文件存储在独立目录中
3. **临时文件清理**：定期清理过期的临时文件

## 配置说明

### 环境变量

```env
# 临时文件目录
TEMP_DIR=./data/temp
```

### 目录结构

```
data/
└── temp/
    └── [session-id]/
        ├── 123456789-filename1.txt
        └── 987654321-filename2.pdf
```

## 故障处理

### 常见问题

1. **WebSocket连接中断**：重新建立连接并恢复上传状态
2. **文件传输失败**：支持断点续传（需要客户端实现）
3. **磁盘空间不足**：检查磁盘空间并清理旧文件

### 错误处理

机器端会返回详细的错误信息：

```json
{
  "type": "response",
  "requestType": "fileUploadStart",
  "data": {
    "success": false,
    "error": "磁盘空间不足"
  }
}
```

## 扩展功能

### 1. 文件类型限制

可以在机器端添加文件类型检查：

```typescript
const allowedMimeTypes = ['text/plain', 'image/jpeg', 'image/png'];
if (!allowedMimeTypes.includes(mimeType)) {
  throw new Error('不支持的文件类型');
}
```

### 2. 文件大小限制

```typescript
const maxFileSize = 10 * 1024 * 1024; // 10MB
if (fileSize > maxFileSize) {
  throw new Error('文件大小超过限制');
}
```

## 性能优化

### 1. 并发上传

支持同时上传多个文件到不同会话。

### 2. 压缩传输

对于文本文件，可以考虑在传输前进行压缩。

### 3. 缓存机制

对于重复文件，可以实现缓存机制避免重复传输。