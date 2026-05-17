import { WebSocket } from 'ws';
import { browserService, SessionConfig } from '../browser.service.js';
import { Page, CDPSession } from 'puppeteer-core';
import { logger } from '@shared/utils/logger.js';

interface StartScreencastParams {
  format?: 'jpeg' | 'png';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}

interface StreamInfo {
  ws: WebSocket;
  page: Page;
  sessionId: string;
  cdpSession: CDPSession | null;
  isActive: boolean;
  useCdpScreencast: boolean;
  timerId: NodeJS.Timeout | null;
  starvationTimer: NodeJS.Timeout | null;
  currentFps: number;
  config: StreamConfig;
  frameCount: number;
  startTime: number;
  lastFrameTime: number;
}

interface StreamConfig {
  format: 'webp' | 'jpeg';
  quality: number;
  maxWidth: number;
  maxHeight: number;
  everyNthFrame: number;
}

const DEFAULT_STREAM_CONFIG: StreamConfig = {
  format: 'webp',
  quality: 60,
  maxWidth: 1280,
  maxHeight: 800,
  everyNthFrame: 1,
};

const activeStreams = new Map<WebSocket, StreamInfo>();

function buildStreamConfig(sessionConfig: SessionConfig | null): StreamConfig {
  const fps = sessionConfig?.fps ?? 15;
  return {
    ...DEFAULT_STREAM_CONFIG,
    everyNthFrame: Math.max(1, Math.round(30 / fps)),
  };
}

// --- CDP Screencast 推流（主方案）---
async function startCdpScreencast(streamInfo: StreamInfo): Promise<void> {
  const { ws, page, sessionId } = streamInfo;

  try {
    await waitForPageReady(page, sessionId);

    if (page.url() !== 'about:blank') {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const cdpSession = await page.createCDPSession();
    streamInfo.cdpSession = cdpSession;

    cdpSession.on('Page.screencastFrame', async (event: { data: string; sessionId: number; metadata: unknown }) => {
      if (!streamInfo.isActive || ws.readyState !== WebSocket.OPEN) {
        try {
          await cdpSession.send('Page.screencastFrameAck', { sessionId: event.sessionId });
        } catch {
          /* ack failure is non-critical */
        }
        return;
      }

      try {
        const buffer = Buffer.from(event.data, 'base64');
        ws.send(buffer, { binary: true });
        streamInfo.frameCount++;
        streamInfo.lastFrameTime = Date.now();

        await cdpSession.send('Page.screencastFrameAck', {
          sessionId: event.sessionId,
        });
      } catch (err: unknown) {
        logger.error('CDP frame send failed', {
          sessionId,
          error: (err as Error).message,
        });
        try {
          await cdpSession.send('Page.screencastFrameAck', { sessionId: event.sessionId });
        } catch {
          /* ack failure is non-critical */
        }
      }
    });

    cdpSession.on('disconnected', () => {
      logger.warn('CDP session disconnected', { sessionId });
      if (streamInfo.isActive && streamInfo.useCdpScreencast) {
        streamInfo.useCdpScreencast = false;
        startScreenshotLoop(streamInfo);
      }
    });

    const config = streamInfo.config;
    await cdpSession.send('Page.startScreencast', {
      format: config.format as 'jpeg' | 'png' | 'webp',
      quality: config.quality,
      maxWidth: config.maxWidth,
      maxHeight: config.maxHeight,
      everyNthFrame: config.everyNthFrame,
    } as StartScreencastParams);

    streamInfo.isActive = true;
    streamInfo.useCdpScreencast = true;
    streamInfo.startTime = Date.now();
    streamInfo.frameCount = 0;

    logger.info('CDP Screencast started', { sessionId, config });

    streamInfo.lastFrameTime = Date.now();
    streamInfo.starvationTimer = setInterval(() => {
      if (!streamInfo.isActive) {
        clearInterval(streamInfo.starvationTimer!);
        streamInfo.starvationTimer = null;
        return;
      }
      const elapsed = Date.now() - streamInfo.lastFrameTime;
      if (elapsed > 3000 && streamInfo.useCdpScreencast) {
        logger.warn(`Frame starvation for ${sessionId}: no frame for ${elapsed}ms, falling back to screenshot loop`);
        streamInfo.useCdpScreencast = false;
        if (streamInfo.starvationTimer) {
          clearInterval(streamInfo.starvationTimer);
          streamInfo.starvationTimer = null;
        }
        startScreenshotLoop(streamInfo);
      }
    }, 2000);
  } catch (err: unknown) {
    logger.error('CDP Screencast start failed, falling back to screenshot loop', {
      sessionId,
      error: (err as Error).message,
    });
    streamInfo.useCdpScreencast = false;
    startScreenshotLoop(streamInfo);
  }
}

async function restartCdpScreencast(streamInfo: StreamInfo): Promise<void> {
  if (!streamInfo.cdpSession || !streamInfo.useCdpScreencast) return;

  try {
    await streamInfo.cdpSession.send('Page.stopScreencast');
  } catch {
    /* stop may fail if already stopped */
  }

  const config = streamInfo.config;
  try {
    await streamInfo.cdpSession.send('Page.startScreencast', {
      format: config.format as 'jpeg' | 'png' | 'webp',
      quality: config.quality,
      maxWidth: config.maxWidth,
      maxHeight: config.maxHeight,
      everyNthFrame: config.everyNthFrame,
    } as StartScreencastParams);
    logger.info('CDP Screencast restarted with new config', {
      sessionId: streamInfo.sessionId,
    });
  } catch (err: unknown) {
    logger.error('CDP Screencast restart failed', {
      sessionId: streamInfo.sessionId,
      error: (err as Error).message,
    });
    streamInfo.useCdpScreencast = false;
    startScreenshotLoop(streamInfo);
  }
}

// --- page.screenshot 回退方案 ---
async function captureAndSend(ws: WebSocket, page: Page, sessionId: string): Promise<boolean> {
  if (ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    const currentConfig = browserService.getSessionConfig(sessionId);
    const screenshotBuffer = await page.screenshot({
      type: 'jpeg',
      quality: 60,
      encoding: 'binary',
      clip: currentConfig?.clip,
    });

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(screenshotBuffer, { binary: true }, (err) => {
        if (err) {
          logger.error(`Screenshot send failed for session ${sessionId}:`, err);
        }
      });
    }
    return true;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Target closed') || msg.includes('Session closed')) {
      logger.warn(`Page/session closed for ${sessionId}. Stopping.`);
      sendSessionEndedMessage(ws, 'browser_closed');
    } else if (msg.includes('WebSocket is not open')) {
      logger.warn(`WebSocket closed for ${sessionId}.`);
    } else if (msg.includes('Not attached') || msg.includes('Target closed')) {
      logger.warn(`Page not attached for ${sessionId}, attempting recovery`);
    } else {
      logger.error(`Screenshot error for ${sessionId}:`, error);
    }
    return false;
  }
}

function startScreenshotLoop(streamInfo: StreamInfo): void {
  const { ws, page, sessionId, currentFps } = streamInfo;
  const intervalMs = 1000 / currentFps;

  logger.info(`Starting screenshot loop fallback for ${sessionId} at ${currentFps} FPS`);

  if (streamInfo.timerId) {
    clearTimeout(streamInfo.timerId);
    streamInfo.timerId = null;
  }

  const scheduleNextCapture = async () => {
    if (!activeStreams.has(ws)) return;

    const success = await captureAndSend(ws, streamInfo.page, sessionId);

    if (!success && streamInfo.page) {
      try {
        const pages = await streamInfo.page.browser().pages();
        const activePage = pages.find((p: Page) => !p.isClosed()) || pages[0];
        if (activePage && activePage !== streamInfo.page) {
          streamInfo.page = activePage;
          logger.info(`Recovered page reference for ${sessionId}, switching to new page`);
        }
      } catch (recoveryErr: unknown) {
        logger.error(`Failed to recover page for ${sessionId}: ${recoveryErr}`);
      }
    }

    if (activeStreams.has(ws)) {
      streamInfo.lastFrameTime = Date.now();
      streamInfo.timerId = setTimeout(scheduleNextCapture, intervalMs);
    } else {
      cleanupStreamConnection(ws);
    }
  };

  streamInfo.isActive = true;
  scheduleNextCapture();
}

// --- 等待页面就绪 ---
const DEFAULT_START_URL = 'http://192.168.0.29:3011/public/test-interactive.html';

async function waitForPageReady(page: Page, _sessionId: string): Promise<void> {
  const currentUrl = page.url();
  if (currentUrl === 'about:blank' || currentUrl === '') {
    try {
      await page.goto(DEFAULT_START_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch {
      /* navigation timeout is acceptable */
    }
  }

  try {
    const testScreenshot = await page.screenshot({ type: 'webp', quality: 30 });
    if (testScreenshot.length < 1000) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch {
    /* test screenshot failure is acceptable */
  }
}

// --- 主入口 ---
export async function handleStreamConnection(ws: WebSocket, sessionId: string): Promise<void> {
  logger.info(`Handling '/stream' WebSocket connection for session ${sessionId}`);

  let page: Page | null;
  let initialConfig: SessionConfig | null;

  try {
    page = await browserService.getSessionPage(sessionId);
    initialConfig = browserService.getSessionConfig(sessionId);

    if (!page || !initialConfig) {
      logger.warn(`Session ${sessionId} not found or config missing.`);
      ws.close(1011, 'Session invalid or prerequisites missing');
      return;
    }

    const initialFps = initialConfig.fps ?? 15;
    const streamConfig = buildStreamConfig(initialConfig);
    const streamInfo: StreamInfo = {
      ws,
      page,
      sessionId,
      cdpSession: null,
      isActive: false,
      useCdpScreencast: true,
      timerId: null,
      starvationTimer: null,
      currentFps: initialFps,
      config: streamConfig,
      frameCount: 0,
      startTime: 0,
      lastFrameTime: Date.now(),
    };
    activeStreams.set(ws, streamInfo);

    // 优先使用 CDP Screencast
    await startCdpScreencast(streamInfo);

    // Page 事件监听
    const pageCloseHandler = () => handlePageCloseOrCrash(ws, sessionId, 'browser_closed');
    const pageCrashHandler = () => handlePageCloseOrCrash(ws, sessionId, 'browser_crashed');
    page.once('close', pageCloseHandler);
    page.once('crash', pageCrashHandler);

    // 配置更新监听
    const configUpdateListener = (updatedSessionId: string, updatedConfig: SessionConfig) => {
      if (updatedSessionId !== sessionId) return;

      const currentStreamInfo = activeStreams.get(ws);
      if (!currentStreamInfo) return;

      const newFps = updatedConfig.fps ?? 15;
      const newStreamConfig = buildStreamConfig(updatedConfig);
      currentStreamInfo.config = newStreamConfig;

      if (currentStreamInfo.currentFps !== newFps) {
        logger.info(`FPS changed for ${sessionId}: ${currentStreamInfo.currentFps} -> ${newFps}`);
        currentStreamInfo.currentFps = newFps;

        if (currentStreamInfo.useCdpScreencast && currentStreamInfo.cdpSession) {
          restartCdpScreencast(currentStreamInfo);
        } else if (!currentStreamInfo.useCdpScreencast) {
          startScreenshotLoop(currentStreamInfo);
        }
      }
    };
    browserService.on('configUpdated', configUpdateListener);

    const tabSwitchedListener = async (switchedSessionId: string, newPage: Page) => {
      if (switchedSessionId !== sessionId) return;
      const currentStreamInfo = activeStreams.get(ws);
      if (!currentStreamInfo || currentStreamInfo.page === newPage) return;

      logger.info(`Tab switched for stream ${sessionId}, switching page`);

      if (currentStreamInfo.cdpSession) {
        try {
          await currentStreamInfo.cdpSession.send('Page.stopScreencast');
        } catch {
          /* ignore */
        }
        try {
          await currentStreamInfo.cdpSession.detach();
        } catch {
          /* ignore */
        }
        currentStreamInfo.cdpSession = null;
      }

      currentStreamInfo.page.off('close', pageCloseHandler);
      currentStreamInfo.page.off('crash', pageCrashHandler);

      currentStreamInfo.page = newPage;
      currentStreamInfo.isActive = false;
      currentStreamInfo.useCdpScreencast = true;

      newPage.once('close', pageCloseHandler);
      newPage.once('crash', pageCrashHandler);

      await startCdpScreencast(currentStreamInfo);
    };
    browserService.on('tabSwitched', tabSwitchedListener);

    ws.on('close', (code, _reason) => {
      logger.info(`'/stream' WebSocket closed for ${sessionId}. Code: ${code}`);
      page?.off('close', pageCloseHandler);
      page?.off('crash', pageCrashHandler);
      browserService.off('configUpdated', configUpdateListener);
      browserService.off('tabSwitched', tabSwitchedListener);
      cleanupStreamConnection(ws);
    });
    ws.on('error', (error) => {
      logger.error(`'/stream' WebSocket error for ${sessionId}:`, error);
      page?.off('close', pageCloseHandler);
      page?.off('crash', pageCrashHandler);
      browserService.off('configUpdated', configUpdateListener);
      browserService.off('tabSwitched', tabSwitchedListener);
      cleanupStreamConnection(ws);
    });
  } catch (error: unknown) {
    logger.error(`Error handling '/stream' for ${sessionId}:`, error);
    ws.close(1011, 'Internal server error during stream setup');
    cleanupStreamConnection(ws);
  }
}

function handlePageCloseOrCrash(ws: WebSocket, sessionId: string, reason: string): void {
  logger.warn(`Page closed/crashed for ${sessionId}. Reason: ${reason}`);
  sendSessionEndedMessage(ws, reason);
  cleanupStreamConnection(ws);
}

async function cleanupStreamConnection(ws: WebSocket): Promise<void> {
  const streamInfo = activeStreams.get(ws);
  if (streamInfo) {
    streamInfo.isActive = false;

    if (streamInfo.cdpSession) {
      try {
        await streamInfo.cdpSession.send('Page.stopScreencast');
      } catch {
        /* stop may fail if already stopped */
      }
      try {
        await streamInfo.cdpSession.detach();
      } catch {
        /* detach may fail if already detached */
      }
      streamInfo.cdpSession = null;
    }

    if (streamInfo.timerId) {
      clearTimeout(streamInfo.timerId);
    }

    if (streamInfo.starvationTimer) {
      clearInterval(streamInfo.starvationTimer);
      streamInfo.starvationTimer = null;
    }

    activeStreams.delete(ws);
    logger.debug(`Cleaned up '/stream' for ${streamInfo.sessionId}.`);
  }
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close(1000, 'Stream cleanup');
  }
}

function sendSessionEndedMessage(ws: WebSocket, reason: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'session_ended', data: { reason } }), (err) => {
      if (err) logger.error('Failed to send session_ended:', err);
    });
  }
}
