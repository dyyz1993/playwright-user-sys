import { WebSocket } from 'ws';
import { browserService, SessionConfig } from '../browser.service.js';
import { Page, ScreenshotOptions } from 'puppeteer-core';
import { logger } from '../../utils/logger.js';

// !! 存储活跃的流连接、Page、定时器以及本地缓存的配置 !!
interface StreamInfo {
    page: Page;
    sessionId: string;
    intervalId: NodeJS.Timeout | null;
    currentFps: number;
    ws: WebSocket; // 保留 WebSocket 引用用于清理
}
const activeStreams = new Map<WebSocket, StreamInfo>();

// !! 移除硬编码 FPS !!
// const HARDCODED_FPS = 15;
// const intervalMs = 1000 / HARDCODED_FPS;

// --- 截图函数 --- (提取出来方便重用和重启定时器)
async function captureAndSend(ws: WebSocket, page: Page, sessionId: string): Promise<boolean> {
    if (ws.readyState !== WebSocket.OPEN) {
        logger.warn(`WebSocket state is not OPEN for session ${sessionId} in captureAndSend. Aborting.`);
        return false; // 表示需要停止
    }
    try {
        const currentConfig = browserService.getSessionConfig(sessionId);
        const screenshotOptions: ScreenshotOptions = {
            type: 'jpeg',
            quality: 80,
            encoding: 'binary',
            clip: currentConfig?.clip, // 实时获取 clip
        };
        const screenshotBuffer = await page.screenshot(screenshotOptions);

        ws.send(screenshotBuffer, { binary: true }, (err) => {
            if (err) {
                logger.error(`Failed to send screenshot for session ${sessionId}:`, err);
                // 发送失败时，让调用者处理清理
            }
        });
        return true; // 表示成功
    } catch (error: any) {
        if (error.message.includes('Target closed') || error.message.includes('Session closed')) {
            logger.warn(`Page or session closed for ${sessionId} during screenshot. Stopping stream.`);
            sendSessionEndedMessage(ws, 'browser_closed');
        } else if (error.message.includes('WebSocket is not open')) {
            logger.warn(`WebSocket closed for ${sessionId} during screenshot attempt. Stopping stream.`);
        } else {
            logger.error(`Error taking screenshot for session ${sessionId}:`, error);
        }
        return false; // 表示出错，需要停止
    }
}

// --- 启动/重启截图定时器 --- 
function startStreamInterval(streamInfo: StreamInfo) {
    const { ws, page, sessionId, currentFps } = streamInfo;
    const intervalMs = 1000 / currentFps;

    logger.info(`Starting/Restarting stream interval for ${sessionId} at ${currentFps} FPS`);

    // 先清除可能存在的旧定时器
    if (streamInfo.intervalId) {
        clearInterval(streamInfo.intervalId);
        streamInfo.intervalId = null;
    }

    streamInfo.intervalId = setInterval(async () => {
        const success = await captureAndSend(ws, page, sessionId);
        if (!success) {
            cleanupStreamConnection(ws); // 如果截图或发送失败，清理连接
        }
    }, intervalMs);
}

export async function handleStreamConnection(ws: WebSocket, sessionId: string): Promise<void> {
  logger.info(`Handling new '/stream' WebSocket connection for session ${sessionId}`);

  let page: Page | null = null;
  let initialConfig: SessionConfig | null = null;

  try {
    page = await browserService.getSessionPage(sessionId);
    initialConfig = browserService.getSessionConfig(sessionId);

    if (!page || !initialConfig) {
      logger.warn(`Session ${sessionId} not found, page unavailable, or config missing. Closing '/stream' socket.`);
      ws.close(1011, 'Session invalid or prerequisites missing');
      return;
    }

    const initialFps = initialConfig.fps ?? 15;
    const streamInfo: StreamInfo = {
        page,
        sessionId,
        intervalId: null,
        currentFps: initialFps,
        ws: ws,
    };
    activeStreams.set(ws, streamInfo);

    // !! 启动初始截图流 !!
    startStreamInterval(streamInfo);
    logger.info(`Initial screenshot stream started for session ${sessionId} at ${initialFps} FPS.`);

    // --- Page 和 WebSocket 事件监听器 --- 
    const pageCloseHandler = () => handlePageCloseOrCrash(ws, sessionId, 'browser_closed');
    const pageCrashHandler = () => handlePageCloseOrCrash(ws, sessionId, 'browser_crashed');
    page.once('close', pageCloseHandler);
    page.once('crash', pageCrashHandler);

    // !! 监听来自 browserService 的配置更新事件 !!
    const configUpdateListener = (updatedSessionId: string, updatedConfig: SessionConfig) => {
        if (updatedSessionId === sessionId) {
            logger.info(`Received config update for stream ${sessionId}:`, updatedConfig);
            const currentStreamInfo = activeStreams.get(ws);
            if (currentStreamInfo) {
                const newFps = updatedConfig.fps ?? 15;
                if (currentStreamInfo.currentFps !== newFps) {
                    logger.info(`FPS changed for ${sessionId} from ${currentStreamInfo.currentFps} to ${newFps}. Restarting stream interval.`);
                    currentStreamInfo.currentFps = newFps;
                    startStreamInterval(currentStreamInfo);
                } else {
                    logger.debug(`FPS unchanged for ${sessionId}, no stream interval restart needed.`);
                }
            }
        }
    };
    browserService.on('configUpdated', configUpdateListener);

    // WebSocket 连接关闭/错误处理
    ws.on('close', (code, reason) => {
       logger.info(`\'/stream\' WebSocket closed for session ${sessionId}. Code: ${code}, Reason: ${reason}`);
       page?.off('close', pageCloseHandler);
       page?.off('crash', pageCrashHandler);
       browserService.off('configUpdated', configUpdateListener);
       cleanupStreamConnection(ws);
    });
    ws.on('error', (error) => {
       logger.error(`\'/stream\' WebSocket error for session ${sessionId}:`, error);
       page?.off('close', pageCloseHandler);
       page?.off('crash', pageCrashHandler);
       browserService.off('configUpdated', configUpdateListener);
       cleanupStreamConnection(ws);
    });

  } catch (error) {
    logger.error(`Error handling \'/stream\' connection for session ${sessionId}:`, error);
    ws.close(1011, 'Internal server error during stream setup');
    cleanupStreamConnection(ws);
  }
}

// !! 恢复 Helper Functions !!
function handlePageCloseOrCrash(ws: WebSocket, sessionId: string, reason: string): void {
  logger.warn(`Page closed or crashed for session ${sessionId}. Reason: ${reason}. Closing \'/stream\' socket.`);
  sendSessionEndedMessage(ws, reason);
  cleanupStreamConnection(ws);
}

function cleanupStreamConnection(ws: WebSocket): void {
  const streamInfo = activeStreams.get(ws);
  if (streamInfo) {
    if (streamInfo.intervalId) {
        clearInterval(streamInfo.intervalId);
    }
    activeStreams.delete(ws);
    logger.debug(`Cleaned up \'/stream\' connection for session ${streamInfo.sessionId}.`);
  }
  // 确保移除事件监听器，以防在 close/error 之外被调用
  // (需要获取 listener 引用，或者在调用此函数前移除)
  // browserService.off(\'configUpdated\', ...); 
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
     ws.close(1000, 'Stream cleanup');
  }
}

function sendSessionEndedMessage(ws: WebSocket, reason: string): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'session_ended', data: { reason } }), (err) => {
            if (err) logger.error("Failed to send session_ended message on stream socket:", err);
        });
    }
}