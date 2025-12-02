import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

// 客户端示例：演示如何在分布式架构中上传文件
class DistributedFileUploader {
  constructor(machineWsUrl) {
    this.wsUrl = machineWsUrl;
    this.ws = null;
    this.sessionId = null;
  }

  // 连接到机器端WebSocket
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        console.log('WebSocket连接已建立');
        resolve();
      });
      
      this.ws.on('error', (error) => {
        console.error('WebSocket连接错误:', error);
        reject(error);
      });
      
      this.ws.on('message', (data) => {
        const message = JSON.parse(data);
        this.handleMessage(message);
      });
    });
  }

  // 处理WebSocket消息
  handleMessage(message) {
    switch (message.type) {
      case 'sessionCreated':
        this.sessionId = message.sessionId;
        console.log('会话已创建:', this.sessionId);
        break;
      case 'fileUploadResponse':
        console.log('文件上传响应:', message);
        break;
      case 'cdpResponse':
        console.log('CDP响应:', message);
        break;
      default:
        console.log('收到消息:', message);
    }
  }

  // 创建浏览器会话
  async createSession() {
    if (!this.ws) {
      throw new Error('WebSocket未连接');
    }

    return new Promise((resolve) => {
      const message = {
        type: 'createSession',
        data: {
          width: 1920,
          height: 1080
        }
      };

      this.ws.send(JSON.stringify(message));
      
      // 等待会话创建响应
      const handleMessage = (data) => {
        const message = JSON.parse(data);
        if (message.type === 'sessionCreated') {
          this.ws.removeListener('message', handleMessage);
          resolve(message.sessionId);
        }
      };
      
      this.ws.on('message', handleMessage);
    });
  }

  // 上传文件到机器端
  async uploadFile(localFilePath, targetFileName) {
    if (!this.ws || !this.sessionId) {
      throw new Error('WebSocket未连接或会话未创建');
    }

    // 读取本地文件
    const fileData = fs.readFileSync(localFilePath);
    const fileName = targetFileName || path.basename(localFilePath);

    // 发送文件上传消息
    const message = {
      type: 'fileUpload',
      sessionId: this.sessionId,
      data: {
        filename: fileName,
        mimetype: this.getMimeType(fileName),
        size: fileData.length,
        buffer: fileData.toString('base64')
      }
    };

    console.log(`正在上传文件: ${fileName} (${fileData.length} bytes)`);

    return new Promise((resolve) => {
      // 监听文件上传响应
      const handleMessage = (data) => {
        const response = JSON.parse(data);
        if (response.type === 'fileUploadResponse' && response.sessionId === this.sessionId) {
          this.ws.removeListener('message', handleMessage);
          console.log('文件上传成功:', response.data);
          resolve(response.data);
        }
      };
      
      this.ws.on('message', handleMessage);
      this.ws.send(JSON.stringify(message));
    });
  }

  // 使用CDP设置文件输入
  async setFileInput(elementSelector, filePath) {
    if (!this.ws || !this.sessionId) {
      throw new Error('WebSocket未连接或会话未创建');
    }

    // 首先定位到文件输入元素
    const nodeIdMessage = {
      type: 'cdp',
      sessionId: this.sessionId,
      method: 'DOM.getDocument'
    };

    const nodeIdResponse = await this.sendCDPMessage(nodeIdMessage);
    const documentNodeId = nodeIdResponse.result.root.nodeId;

    // 查找文件输入元素
    const queryMessage = {
      type: 'cdp',
      sessionId: this.sessionId,
      method: 'DOM.querySelector',
      params: {
        nodeId: documentNodeId,
        selector: elementSelector
      }
    };

    const queryResponse = await this.sendCDPMessage(queryMessage);
    const elementNodeId = queryResponse.result.nodeId;

    // 设置文件输入
    const setFileMessage = {
      type: 'cdp',
      sessionId: this.sessionId,
      method: 'DOM.setFileInputFiles',
      params: {
        nodeId: elementNodeId,
        files: [filePath]
      }
    };

    return await this.sendCDPMessage(setFileMessage);
  }

  // 发送CDP消息并等待响应
  async sendCDPMessage(message) {
    return new Promise((resolve) => {
      const handleMessage = (data) => {
        const response = JSON.parse(data);
        if (response.type === 'cdpResponse' && 
            response.sessionId === this.sessionId && 
            response.id === message.id) {
          this.ws.removeListener('message', handleMessage);
          resolve(response);
        }
      };
      
      // 添加唯一ID用于匹配响应
      message.id = Date.now();
      
      this.ws.on('message', handleMessage);
      this.ws.send(JSON.stringify(message));
    });
  }

  // 获取文件MIME类型
  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // 关闭连接
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// 使用示例
async function main() {
  try {
    // 替换为您的机器端WebSocket地址
    const uploader = new DistributedFileUploader('ws://localhost:8082');
    
    // 连接到机器端
    await uploader.connect();
    
    // 创建浏览器会话
    const sessionId = await uploader.createSession();
    console.log('创建会话:', sessionId);
    
    // 上传本地文件到机器端
    const uploadResult = await uploader.uploadFile('./test-file.txt', 'uploaded-file.txt');
    
    // 使用CDP设置文件输入（假设页面上有一个文件输入元素）
    // await uploader.setFileInput('input[type="file"]', uploadResult.filepath);
    
    console.log('文件上传和设置完成');
    
  } catch (error) {
    console.error('操作失败:', error);
  }
}

// 创建测试文件
fs.writeFileSync('./test-file.txt', '这是一个测试文件的内容');

// 运行示例
main().then(() => {
  console.log('示例执行完成');
}).catch((error) => {
  console.error('示例执行出错:', error);
});

export default DistributedFileUploader;