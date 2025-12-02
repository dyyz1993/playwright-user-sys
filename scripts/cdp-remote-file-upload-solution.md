# CDP 远程文件上传解决方案

## 问题背景

在分布式架构中：
- 管理端：处理用户请求、认证、计费
- 机器端：实际运行浏览器实例的物理机器

用户在本地需要上传文件到云端浏览器，但管理端和机器端是不同的物理机器。

## 解决方案分析

### 方案一：CDP 直接数据注入（推荐）

#### 实现原理

1. 本地通过 WebSocket 将文件数据发送到机器端
2. 机器端接收文件数据并临时存储
3. 使用 CDP 的 DOM.setFileInputFiles 方法设置文件路径
4. 浏览器访问机器端本地的文件

#### 技术实现

```javascript
// 1. 本地 -> 机器端 (通过 WebSocket)
const fileData = await readFileAsArrayBuffer(fileInput.files[0]);
websocket.send(JSON.stringify({
  type: 'file_upload',
  sessionId: 'session_id',
  filename: fileInput.files[0].name,
  data: Array.from(new Uint8Array(fileData)) // 转换为数组以便传输
}));

// 2. 机器端接收并存储
websocketServer.on('message', (message) => {
  const data = JSON.parse(message);
  if (data.type === 'file_upload') {
    // 保存到临时文件
    const tempPath = path.join('/tmp', `${Date.now()}-${data.filename}`);
    fs.writeFileSync(tempPath, Buffer.from(data.data));
    
    // 通知前端文件已准备就绪
    websocket.send(JSON.stringify({
      type: 'file_ready',
      filepath: tempPath
    }));
  }
});

// 3. 使用 CDP 设置文件
const cdp = await page.target().createCDPSession();
await cdp.send('DOM.setFileInputFiles', {
  objectId: fileInputElementId,
  files: [serverFilePath]
});
```

### 方案二：共享存储方案

#### 实现原理

1. 使用网络文件系统（NFS、S3等）作为共享存储
2. 所有机器都可以访问相同的文件存储
3. 文件上传到共享存储后，所有机器都能访问

#### 技术实现

```javascript
// 1. 上传到共享存储
const sharedStoragePath = 's3://bucket/uploads/';
const fileKey = `${Date.now()}-${filename}`;
await s3.upload({
  Bucket: 'bucket',
  Key: `uploads/${fileKey}`,
  Body: fileData
}).promise();

// 2. 在机器端映射到本地路径
const localPath = path.join('/mnt/shared', 'uploads', fileKey);
// 使用 CDP 设置文件
await cdp.send('DOM.setFileInputFiles', {
  objectId: fileInputElementId,
  files: [localPath]
});
```

### 方案三：浏览器扩展方案

#### 实现原理

1. 开发浏览器扩展来处理远程文件
2. 扩展拦截文件选择操作
3. 直接在扩展中处理远程文件数据

#### 技术实现

```javascript
// 1. 浏览器扩展代码
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "uploadRemoteFile") {
    // 处理远程文件上传
    fetch(request.fileUrl)
      .then(response => response.arrayBuffer())
      .then(data => {
        // 将数据注入到文件输入元素
        const file = new File([data], request.filename, { type: request.mimeType });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector(request.selector);
        input.files = dataTransfer.files;
        
        // 触发 change 事件
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
  }
});
```

## 推荐实现

### 基于 WebSocket 的实时文件传输

这是最适合您架构的解决方案：

#### 1. 本地客户端代码

```javascript
class RemoteFileUploader {
  constructor(websocketUrl) {
    this.ws = new WebSocket(websocketUrl);
  }
  
  async uploadFile(file, sessionId) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        // 发送文件数据到机器端
        this.ws.send(JSON.stringify({
          type: 'file_upload',
          sessionId: sessionId,
          filename: file.name,
          size: file.size,
          mimeType: file.type,
          data: Array.from(new Uint8Array(e.target.result))
        }));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
}
```

#### 2. 机器端处理代码

```javascript
// 在机器端的 WebSocket 处理器中
async function handleFileUpload(data) {
  try {
    // 创建临时文件
    const tempDir = path.join(os.tmpdir(), 'playwright-files');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filename = `${Date.now()}-${data.filename}`;
    const filepath = path.join(tempDir, filename);
    
    // 保存文件
    const buffer = Buffer.from(data.data);
    fs.writeFileSync(filepath, buffer);
    
    // 通过内部通信通知会话服务文件已准备好
    await sessionService.notifyFileReady(data.sessionId, {
      filename: data.filename,
      filepath: filepath,
      mimeType: data.mimeType,
      size: data.size
    });
    
    return { success: true, filepath };
  } catch (error) {
    console.error('文件上传处理失败:', error);
    return { success: false, error: error.message };
  }
}
```

#### 3. CDP 集成

```javascript
// 在会话服务中
async function setFileInput(sessionId, elementSelector, filepath) {
  const page = await getSessionPage(sessionId);
  const cdp = await page.target().createCDPSession();
  
  // 查找文件输入元素
  const element = await page.$(elementSelector);
  if (!element) {
    throw new Error('未找到文件输入元素');
  }
  
  // 获取元素 objectId
  const { objectId } = await element.evaluateHandle(el => el);
  
  // 使用 CDP 设置文件
  await cdp.send('DOM.setFileInputFiles', {
    objectId: objectId.asElement().remoteObject().objectId,
    files: [filepath]
  });
}
```

## 优势分析

### CDP 直接数据注入方案优势：

1. **无需共享存储**：不依赖外部存储系统
2. **实时传输**：文件数据实时传输，延迟低
3. **安全性高**：文件传输通过加密 WebSocket 进行
4. **架构简单**：充分利用现有架构，改动最小
5. **性能优秀**：直接内存操作，性能最佳

### 实现步骤：

1. 在本地客户端实现文件读取和 WebSocket 传输
2. 在机器端实现 WebSocket 接收和文件存储
3. 扩展会话服务以支持文件管理
4. 集成 CDP 操作设置文件输入
5. 添加清理机制避免磁盘空间占用

这个方案完全符合您的分布式架构需求，管理端不需要参与文件存储，文件直接在本地和机器端之间传输。