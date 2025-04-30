import { WebSocket } from "ws";
import { BrowserManager } from "../browser-manager.js";
import { Page } from 'puppeteer-core';

// 为全局window对象添加自定义属性的类型声明
declare global {
  interface Window {
    updateMousePosition: (x: number, y: number, width: number, height: number) => void;
  }
}


// 事件消息接口
interface EventMessage {
  type: string;
  event: {
    type: string;
    timestamp?: number; // 添加时间戳
    [key: string]: unknown;
  };
}

// 事件队列接口
interface QueuedEvent {
  event: EventMessage['event'];
  timestamp: number;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

export function setupEventSocket(
  ws: WebSocket,
  browserManager: BrowserManager,
  viewId: string
): void {
  console.log(`Event socket connected for viewId: ${viewId}`);

  // 事件队列
  const eventQueue: QueuedEvent[] = [];
  let isProcessingQueue = false;
  const MAX_QUEUE_SIZE = 50; // 最大队列长度
  const EVENT_EXPIRY_TIME = 100; // 事件过期时间（毫秒）

  // 获取页面实例
  const page = browserManager.getPage(viewId);
  if (!page) {
    ws.send(
      JSON.stringify({
        success: false,
        error: `Page not found for viewId: ${viewId}`,
      })
    );
    ws.close();
    return;
  }

  // 获取当前配置并同步给客户端
  const syncConfig = () => {
    const config = browserManager.getViewConfig(viewId);
    ws.send(
      JSON.stringify({
        success: true,
        type: 'configSync',
        config
      })
    );
  };

  // 添加事件到队列
  const addEventToQueue = (event: EventMessage['event']): Promise<any> => {
    return new Promise((resolve, reject) => {
      // 为事件添加时间戳（如果没有的话）
      const timestamp = event.timestamp as number || Date.now();
      
      // 创建队列事件对象
      const queuedEvent: QueuedEvent = {
        event,
        timestamp,
        resolve,
        reject
      };
      
      // 添加到队列
      eventQueue.push(queuedEvent);
      
      // 如果队列过长，删除最旧的事件
      if (eventQueue.length > MAX_QUEUE_SIZE) {
        const removedEvent = eventQueue.shift();
        if (removedEvent) {
          console.log(`丢弃过期事件: ${removedEvent.event.type}, 延迟: ${Date.now() - removedEvent.timestamp}ms`);
        }
      }
      
      // 对队列按时间戳排序（新的事件排在后面）
      eventQueue.sort((a, b) => a.timestamp - b.timestamp);
      
      // 启动队列处理（如果还没启动）
      if (!isProcessingQueue) {
        processEventQueue();
      }
    });
  };

  // 处理事件队列
  const processEventQueue = async () => {
    if (isProcessingQueue || eventQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    try {
      // 处理队列中的所有事件
      while (eventQueue.length > 0) {
        // 获取当前时间
        const now = Date.now();
        
        // 检查队列头部的事件是否过期
        while (eventQueue.length > 0 && now - eventQueue[0].timestamp > EVENT_EXPIRY_TIME) {
          const expiredEvent = eventQueue.shift();
          if (expiredEvent) {
            console.log(`丢弃过期事件: ${expiredEvent.event.type}, 延迟: ${now - expiredEvent.timestamp}ms`);
            expiredEvent.reject(new Error('Event expired'));
          }
        }
        
        // 如果队列为空，结束处理
        if (eventQueue.length === 0) break;
        
        // 处理下一个事件
        const nextEvent = eventQueue.shift();
        if (!nextEvent) continue;
        
        try {
          // 处理事件
          const result = await handleEvent(nextEvent.event);
          nextEvent.resolve(result);
        } catch (error) {
          nextEvent.reject(error);
        }
      }
    } finally {
      isProcessingQueue = false;
      
      // 如果还有事件，继续处理
      if (eventQueue.length > 0) {
        processEventQueue();
      }
    }
  };

  // 处理单个事件
  const handleEvent = async (event: EventMessage['event']) => {
    const config = browserManager.getViewConfig(viewId);
    console.log("event", event);
    
    // 处理不同类型的事件
    switch (event.type) {
      case "mousedown":
      case "mouseup":
      case "click":
        if(event.type === "click" && !event.x && !event.y){
          // 从BrowserManager获取当前鼠标位置
          const currentPos = browserManager.getMousePosition(viewId);
          if (currentPos) {
            event.x = currentPos.x;
            event.y = currentPos.y;
          } else {
            event.x = 0;
            event.y = 0;
          }
        }
      case "mousemove":
      case "scroll":
      case "keydown":
      case "keyup":
      case "keypress":
        // 执行事件
        await browserManager.executeEvent(viewId, event.type, event);
        return { success: true };

      case "mousemovediff":
        // 处理相对鼠标移动事件，需要确保有deltaX和deltaY属性
        if (
          typeof event.deltaY === "number" &&
          typeof event.deltaX === "number"
        ) {
          // 从BrowserManager获取当前鼠标位置
          const currentPos = browserManager.getMousePosition(viewId);
          
          if (!currentPos) {
            // 初始化鼠标位置
            const viewport = page.viewport();
            const newPos = {
              x: viewport?.width ? viewport.width/2 : 0,
              y: viewport?.height ? viewport.height/2 : 0,
              width: viewport?.width || 0,
              height: viewport?.height || 0
            };
            browserManager.updateMousePosition(viewId, newPos);
            return { success: false, error: "Mouse position not initialized" };
          }
          
          // 计算新位置
          const newPosX = currentPos.x + event.deltaX;
          const newPosY = currentPos.y + event.deltaY;
          
          // 确保不超出视口边界
          const posX = Math.max(0, Math.min(currentPos.width, newPosX));
          const posY = Math.max(0, Math.min(currentPos.height, newPosY));
          
          // 更新鼠标位置
          browserManager.updateMousePosition(viewId, {
            ...currentPos,
            x: posX,
            y: posY
          });
          
          // 执行鼠标移动事件
          await browserManager.executeEvent(viewId, "mousemove", {
            x: posX,
            y: posY,
          });
          
          return { success: true };
        } else {
          throw new Error(
            "Invalid mousemovediff event: missing deltaX or deltaY coordinates"
          );
        }

      case "updateFps":
        // 更新视图配置
        browserManager.updateViewConfig(viewId, { fps: event.fps as number });
        syncConfig(); // 同步配置给客户端
        return { success: true };

      case "updateClip":
        // 更新裁剪区域
        browserManager.updateViewConfig(viewId, {
          clip: {
            x: event.x as number,
            y: event.y as number,
            width: event.width as number,
            height: event.height as number,
          },
          keepRatio: event.keepRatio as boolean,
        });
        syncConfig(); // 同步配置给客户端
        return { success: true };

      case "updateTouchMode":
        // 更新触控板模式
        const touchMode = event.touchMode as 'touchpad' | 'touch';
        browserManager.updateViewConfig(viewId, { touchMode });
        
        // 更新光标显示状态 - 页面可能已被刷新，需要重新注入脚本
        // await browserManager.injectMouseTrackingScript(viewId, page);
        
        if (touchMode === 'touchpad') {
          // 更新FPS
          browserManager.updateViewConfig(viewId, { fps: 10 });
        }
        
        syncConfig(); // 同步配置给客户端
        return { success: true };

      case "resetView":
        // 重置视图
        browserManager.updateViewConfig(viewId, {
          clip: undefined,
        });
        syncConfig(); // 同步配置给客户端
        return { success: true };

      case "extract":
        // 提取表单数据
        const formData = await browserManager.extractForm(viewId);
        return {
          success: true,
          type: "form",
          formData: formData,
        };

      case "fill":
        // 填充表单
        await browserManager.fillForm(viewId, event.formData as any[]);
        return { success: true };

      default:
        throw new Error(`Unsupported event type: ${event.type}`);
    }
  };

  // 处理接收到的消息
  ws.on("message", async (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString()) as EventMessage;
      const { type, event } = data;
      
      // 将事件添加到队列中
      try {
        const result = await addEventToQueue(event);
        ws.send(JSON.stringify(result));
      } catch (error) {
        console.error("Error processing event:", error);
        ws.send(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          })
        );
      }
    } catch (error) {
      console.error("Error handling event message:", error);
      ws.send(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
    }
  });

  // 连接成功后立即发送当前配置
  syncConfig();

  // // 确保鼠标跟踪脚本已注入
  // browserManager.injectMouseTrackingScript(viewId, page).catch(error => {
  //   console.error("Error injecting mouse tracking script:", error);
  // });

  ws.on("close", () => {
    console.log(`Event socket disconnected for viewId: ${viewId}`);
    // 清空事件队列，拒绝所有挂起的事件
    while (eventQueue.length > 0) {
      const event = eventQueue.shift();
      if (event) {
        event.reject(new Error('WebSocket connection closed'));
      }
    }
  });

  ws.on("error", (error) => {
    console.error(`Event socket error for viewId: ${viewId}:`, error);
  });
}
