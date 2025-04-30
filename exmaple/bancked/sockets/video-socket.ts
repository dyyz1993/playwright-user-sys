import { WebSocket } from 'ws';
import { BrowserManager } from '../browser-manager.js';
import { URL } from 'url';

interface VideoMessage {
  type: string;
}

export function setupVideoSocket(ws: WebSocket, browserManager: BrowserManager, viewId: string): void {
  console.log(`Video socket connected for viewId: ${viewId}`);
  
  let streamInterval: NodeJS.Timeout | null = null;
  
  // 连接处理
  ws.on('message', async (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString()) as VideoMessage;
      
      if (data.type === 'init') {
        // 检查页面是否存在
        const page = browserManager.getPage(viewId);
        if (!page) {
          ws.send(JSON.stringify({ success: false, error: 'Page not found' }));
          ws.close();
          return;
        }
        
        // 发送初始化成功
        ws.send(JSON.stringify({ success: true }));
        
        // 启动截图流
        startVideoStream(viewId);
      } else if (data.type === 'stop') {
        stopVideoStream();
        ws.send(JSON.stringify({ success: true }));
      }
    } catch (error) {
      console.error('Error handling video message:', error);
      ws.send(JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }));
    }
  });

  // 关闭连接
  ws.on('close', () => {
    console.log(`Video socket disconnected for viewId: ${viewId}`);
    stopVideoStream();
  });

  // 错误处理
  ws.on('error', (error) => {
    console.error(`Video socket error for viewId: ${viewId}:`, error);
    stopVideoStream();
  });
  
  // 启动视频流
  function startVideoStream(id: string): void {
    if (streamInterval) {
      clearTimeout(streamInterval);
      streamInterval = null;
    }
    
    // 创建截图函数
    const captureAndSend = async () => {
      try {
        if (ws.readyState !== WebSocket.OPEN) {
          stopVideoStream();
          return;
        }
        
        // 获取最新的帧率配置
        const latestConfig = browserManager.getViewConfig(id);
        if (!latestConfig) {
          ws.send(JSON.stringify({ success: false, error: 'Config not found' }));
          return;
        }
        
        const fps = latestConfig.fps || 2;
        const interval = 1000 / fps;
        
        const screenshot = await browserManager.captureScreenshot(id);
        if (screenshot) {

          ws.send(screenshot);
        }
        
        // 使用最新的fps设置下一次截图时间
        if (ws.readyState === WebSocket.OPEN) {
          streamInterval = setTimeout(captureAndSend, interval);
        }
      } catch (error) {
        console.error('Error capturing screenshot:', error);
        
        // 即使出错也要继续尝试
        if (ws.readyState === WebSocket.OPEN) {
          const config = browserManager.getViewConfig(id);
          const fps = config?.fps || 2;
          const interval = 1000 / fps;
          streamInterval = setTimeout(captureAndSend, interval);
        }
      }
    };
    // 立即开始第一次截图
    captureAndSend();
  }
  
  // 停止视频流
  function stopVideoStream(): void {
    if (streamInterval) {
      clearTimeout(streamInterval);
      streamInterval = null;
    }
  }
} 