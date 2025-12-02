/**
 * 完整的分布式文件上传示例
 * 演示如何在管理端、机器端和客户端之间传输文件
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

// 客户端示例：演示如何在分布式架构中上传文件
class DistributedFileUploader {
  constructor(machineWsUrl) {
    this.wsUrl = machineWsUrl;
    this.ws = null;
    this.sessionId = null;
    this.messageId = 0;
    this.pendingResponses = new Map();
  }

  // 连接到机器端WebSocket
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        console.log('WebSocket连接已建立');
        this.setupMessageHandler();
        resolve();
      });
      
      this.ws.on('error', (error) => {
        console.error('WebSocket连接错误:', error);
        reject(error);
      });
    });
  }

  // 设置消息处理程序
  setupMessageHandler() {
    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      
      // 处理响应消息
      if (message.type === 'response') {
        const pending = this.pendingResponses.get(message.id);
        if (pending) {
          this.pendingResponses.delete(message.id);
          if (message.data && message.data.success) {
            pending.resolve(message.data);
          } else {
            pending.reject(new Error(message.data?.error || '操作失败'));
          }
        }
        return;
      }
      
      // 处理通知消息
      this.handleNotification(message);
    });
  }

  // 处理通知消息
  handleNotification(message) {
    switch (message.type) {
      case 'sessionCreated':
        this.sessionId = message.sessionId;
        console.log('会话已创建:', this.sessionId);
        break;
      case 'session_ended':
        console.log('会话已结束:', message.data?.reason);
        break;
      default:
        console.log('收到通知:', message);
    }
  }

  // 发送消息并等待响应
  async sendMessage(message) {
    if (!this.ws) {
      throw new Error('WebSocket未连接');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      message.id = id;
      
      this.pendingResponses.set(id, { resolve, reject });
      
      this.ws.send(JSON.stringify(message));
      
      // 设置超时
      setTimeout(() => {
        if (this.pendingResponses.has(id)) {
          this.pendingResponses.delete(id);
          reject(new Error('请求超时'));
        }
      }, 30000);
    });
  }

  // 创建浏览器会话
  async createSession() {
    const message = {
      type: 'createSession',
      data: {
        width: 1920,
        height: 1080
      }
    };

    const response = await this.sendMessage(message);
    this.sessionId = response.sessionId;
    console.log('会话已创建:', this.sessionId);
    return this.sessionId;
  }

  // 上传文件到机器端（分块传输）
  async uploadFile(localFilePath, targetFileName = null) {
    if (!this.sessionId) {
      throw new Error('会话未创建');
    }

    const fileName = targetFileName || path.basename(localFilePath);
    const fileStats = fs.statSync(localFilePath);
    const fileSize = fileStats.size;
    
    console.log(`准备上传文件: ${fileName} (${fileSize} bytes)`);

    // 分块大小（1MB）
    const chunkSize = 1024 * 1024;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    // 发送文件上传开始消息
    const startMessage = {
      type: 'fileUploadStart',
      sessionId: this.sessionId,
      data: {
        filename: fileName,
        size: fileSize,
        totalChunks: totalChunks
      }
    };

    const startResponse = await this.sendMessage(startMessage);
    console.log('文件上传开始响应:', startResponse);

    // 读取并发送文件块
    const fileBuffer = fs.readFileSync(localFilePath);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, fileSize);
      const chunk = fileBuffer.slice(start, end);
      
      const chunkMessage = {
        type: 'fileUploadChunk',
        sessionId: this.sessionId,
        data: {
          chunkIndex: i,
          chunk: chunk.toString('base64'),
          isLast: i === totalChunks - 1
        }
      };

      console.log(`正在上传块 ${i + 1}/${totalChunks}`);
      const chunkResponse = await this.sendMessage(chunkMessage);
      console.log(`块 ${i + 1} 上传完成`);
    }

    console.log('文件上传完成');
    return startResponse;
  }

  // 使用CDP设置文件输入
  async setFileInput(elementSelector, filePath) {
    if (!this.sessionId) {
      throw new Error('会话未创建');
    }

    // 获取文档节点
    const documentMessage = {
      type: 'cdp',
      sessionId: this.sessionId,
      method: 'DOM.getDocument'
    };

    const documentResponse = await this.sendMessage(documentMessage);
    const documentNodeId = documentResponse.result.root.nodeId;

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

    const queryResponse = await this.sendMessage(queryMessage);
    if (!queryResponse.result.nodeId) {
      throw new Error('未找到文件输入元素');
    }

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

    return await this.sendMessage(setFileMessage);
  }

  // 导航到指定URL
  async navigateTo(url) {
    if (!this.sessionId) {
      throw new Error('会话未创建');
    }

    const message = {
      type: 'page.goto',
      sessionId: this.sessionId,
      data: {
        url: url
      }
    };

    return await this.sendMessage(message);
  }

  // 关闭会话
  async closeSession() {
    if (!this.sessionId) {
      return;
    }

    const message = {
      type: 'closeSession',
      sessionId: this.sessionId
    };

    try {
      await this.sendMessage(message);
    } catch (error) {
      console.error('关闭会话时出错:', error);
    }

    this.sessionId = null;
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
    // 创建测试文件
    const testFilePath = './test-upload-file.txt';
    fs.writeFileSync(testFilePath, '这是一个用于测试分布式文件上传的文件内容。\n'.repeat(1000));
    
    // 替换为您的机器端WebSocket地址
    const uploader = new DistributedFileUploader('ws://localhost:8082');
    
    // 连接到机器端
    await uploader.connect();
    console.log('已连接到机器端');
    
    // 创建浏览器会话
    await uploader.createSession();
    
    // 导航到测试页面（假设有一个文件上传表单）
    // await uploader.navigateTo('http://example.com/upload-page');
    
    // 上传本地文件到机器端
    const uploadResult = await uploader.uploadFile(testFilePath, 'uploaded-test-file.txt');
    console.log('文件上传结果:', uploadResult);
    
    // 使用CDP设置文件输入（假设页面上有一个文件输入元素）
    // await uploader.setFileInput('input[type="file"]', uploadResult.filepath);
    
    console.log('文件上传和设置完成');
    
    // 关闭会话
    await uploader.closeSession();
    
  } catch (error) {
    console.error('操作失败:', error);
  } finally {
    // 清理测试文件
    try {
      fs.unlinkSync('./test-upload-file.txt');
    } catch (error) {
      // 文件可能不存在，忽略错误
    }
  }
}

// 如果直接运行此脚本，则执行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => {
    console.log('示例执行完成');
  }).catch((error) => {
    console.error('示例执行出错:', error);
  });
}

export default DistributedFileUploader;