import { WebSocket, RawData } from 'ws';
import { browserService, SessionConfig } from '../browser.service.js';
import { Page, Frame } from 'puppeteer-core';
import { logger } from '@shared/utils/logger.js';
import { sessionFocusEmitter } from '../utils.js';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

// !! 扩展 Window 接口以包含自定义函数 !!
declare global {
  interface Window {
    _mouseTrackingInjected?: boolean;
    updateMousePosition?: (_x: number, _y: number, _viewportWidth: number, _viewportHeight: number) => void;
    _focusListenerAttached?: boolean;
    _emitFocusEvent?: () => void;
  }
}

// !! 存储活跃的事件连接、Page 对象以及本地缓存的配置 !!
interface EventConnectionInfo {
  page: Page;
  sessionId: string;
  config: SessionConfig; // 本地缓存，通过 configUpdated 同步
  // 清理函数句柄，方便移除
  listeners: {
    pageCloseHandler?: () => void;
    pageCrashHandler?: () => void;
    frameNavigatedHandler?: (_frame: Frame) => void;
    configUpdateListener?: (_sessionId: string, _newConfig: SessionConfig) => void;
    // 页面内 focus 监听器理论上随页面关闭，但保留引用以明确
    focusListenerAttached?: boolean;
  };
}
const activeEventConnections = new Map<WebSocket, EventConnectionInfo>();

// == 定义鼠标追踪脚本 ==

export async function handleEventsConnection(
  ws: WebSocket,
  sessionId: string
  // !! 移除 initialConfigFromUrl 参数 !!
  // initialConfigFromUrl?: Partial<SessionConfig>
): Promise<void> {
  logger.info(`Handling new '/events' connection for session ${sessionId}`);

  let page: Page | null = null;
  let currentConfig: SessionConfig | null = null;
  let connectionInfo: EventConnectionInfo | null = null;

  try {
    page = await browserService.getSessionPage(sessionId);
    if (!page || page.isClosed()) {
      logger.warn(`Session ${sessionId}: Page unavailable or closed. Closing '/events' socket.`);
      ws.close(1011, 'Session invalid or page unavailable');
      return;
    }

    // !! 移除: 不再从此函数应用 URL 初始配置 !!
    // 初始配置应由 WebSocket 升级处理器在首次连接时设置
    currentConfig = browserService.getSessionConfig(sessionId);

    if (!currentConfig) {
      logger.error(`Session ${sessionId}: Failed to get initial config. Closing '/events' socket.`);
      ws.close(1011, 'Failed to initialize session config');
      return;
    }

    // 创建并存储连接状态
    connectionInfo = {
      page,
      sessionId,
      config: { ...currentConfig },
      listeners: {},
    };
    activeEventConnections.set(ws, connectionInfo);

    // --- Clipboard polling ---
    let lastClipboardContent = '';
    const clipboardPollInterval = setInterval(async () => {
      const conn = activeEventConnections.get(ws);
      if (!conn || conn.page.isClosed() || ws.readyState !== WebSocket.OPEN) {
        clearInterval(clipboardPollInterval);
        return;
      }
      try {
        const content = await conn.page.evaluate(() => (window as any).__clipboardContent || '').catch(() => '');
        if (content && content !== lastClipboardContent) {
          lastClipboardContent = content;
          sendNotification(ws, 'clipboard', { text: content });
        }
      } catch {
        // page may have navigated or closed
      }
    }, 2000);
    (connectionInfo as any)._clipboardPollInterval = clipboardPollInterval;
    logger.info(
      `Stored '/events' connection for session ${sessionId} with initial config: ${JSON.stringify(currentConfig)}`
    );

    // 发送初始 configSync
    sendConfigSync(ws, currentConfig);

    // --- 添加 Page 事件监听 ---
    connectionInfo.listeners.pageCloseHandler = () => handlePageCloseOrCrash(ws, sessionId, 'browser_closed');
    connectionInfo.listeners.pageCrashHandler = () => handlePageCloseOrCrash(ws, sessionId, 'browser_crashed');
    connectionInfo.listeners.frameNavigatedHandler = (frame: Frame) => {
      if (page && !page.isClosed() && frame === page.mainFrame()) {
        const url = frame.url();
        // 忽略 about:blank 或 data: URI
        if (!url.startsWith('about:') && !url.startsWith('data:')) {
          logger.info(`Navigation detected for session ${sessionId}: ${url}`);
          sendNotification(ws, 'navigationChanged', { url });
        }
      }
    };
    page.once('close', connectionInfo.listeners.pageCloseHandler);
    page.once('crash', connectionInfo.listeners.pageCrashHandler);
    page.on('framenavigated', connectionInfo.listeners.frameNavigatedHandler);
    logger.debug(`Attached page listeners for ${sessionId}`);

    // 添加 focusin 监听 (确保幂等性)
    sessionFocusEmitter.off(`rawFocusEvent:${sessionId}`, handleRawFocusEvent.bind(null, page, ws, sessionId));
    sessionFocusEmitter.on(`rawFocusEvent:${sessionId}`, handleRawFocusEvent.bind(null, page, ws, sessionId));
    logger.info(`Subscribed to raw focus events for session ${sessionId}`);
    // --- 添加 browserService 事件监听 ---
    connectionInfo.listeners.configUpdateListener = (updatedSessionId: string, newConfig: SessionConfig) => {
      if (updatedSessionId === sessionId) {
        const conn = activeEventConnections.get(ws);
        if (conn) {
          logger.info(`Config updated via service for session ${sessionId}:`, newConfig);
          conn.config = { ...newConfig }; // 更新本地缓存
          sendConfigSync(ws, newConfig); // 发送同步消息
        }
      }
    };
    browserService.on('configUpdated', connectionInfo.listeners.configUpdateListener);
    logger.debug(`Attached browserService 'configUpdated' listener for ${sessionId}`);

    // --- 设置 WebSocket 监听器 ---
    ws.on('message', (message: RawData) => {
      browserService.updateSessionActivity(sessionId);
      handleIncomingEventMessage(ws, message);
    });

    ws.on('close', (code, reason) => {
      logger.info(`'/events' WebSocket closed for session ${sessionId}. Code: ${code}, Reason: ${String(reason)}`);
      cleanupEventConnection(ws);
    });

    ws.on('error', (error) => {
      logger.error(`'/events' WebSocket error for session ${sessionId}:`, error);
      cleanupEventConnection(ws);
    });
  } catch (error) {
    logger.error(`Error setting up '/events' connection for session ${sessionId}:`, error);
    ws.close(1011, 'Internal server error during event setup');
    if (connectionInfo) {
      // 如果 connectionInfo 已创建，尝试清理
      cleanupEventConnection(ws);
    } else {
      // 否则，至少从 Map 中删除 ws （如果已添加）
      activeEventConnections.delete(ws);
    }
  }
}

interface FileUploadStartData {
  filename: string;
  totalChunks: number;
  size: number;
}

interface FileUploadChunkData {
  filepath: string;
  chunkIndex: number;
  data: string;
  chunk: string;
  isLast?: boolean;
}

interface MouseEventData {
  selector?: string;
  frameSelector?: string;
  value?: string;
  deltaX?: number;
  deltaY?: number;
  tx?: number;
  ty?: number;
  x?: number;
  y?: number;
  button?: string;
  key?: string;
  code?: string;
  type?: string;
  clickCount?: number;
}

// --- 文件上传处理函数 ---
async function handleFileUploadStart(ws: WebSocket, sessionId: string, data: FileUploadStartData): Promise<void> {
  try {
    logger.info(`Starting file upload for session ${sessionId}: ${data.filename}`);

    // 确保会话临时目录存在
    const sessionTempDir = path.join(CONFIG.tempDir, sessionId);
    if (!fs.existsSync(sessionTempDir)) {
      fs.mkdirSync(sessionTempDir, { recursive: true });
    }

    // 生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = uniqueSuffix + '-' + path.basename(data.filename);
    const filePath = path.join(sessionTempDir, fileName);

    // 存储上传状态
    const uploadState = {
      filePath: filePath,
      fileName: data.filename,
      totalChunks: data.totalChunks,
      receivedChunks: 0,
      fileSize: data.size,
    };

    // 将上传状态存储在连接信息中
    const connectionInfo = activeEventConnections.get(ws);
    if (connectionInfo) {
      if (!connectionInfo.config.uploadStates) {
        connectionInfo.config.uploadStates = {};
      }
      connectionInfo.config.uploadStates[fileName] = uploadState;
    }

    logger.info(`File upload started for session ${sessionId}: ${filePath}`);

    // 发送响应
    sendResponse(ws, 'fileUploadStart', {
      success: true,
      filepath: filePath,
      filename: data.filename,
      size: data.size,
    });
  } catch (error) {
    logger.error(`Failed to start file upload for session ${sessionId}:`, error);
    sendResponse(ws, 'fileUploadStart', {
      success: false,
      error: (error as Error).message,
    });
  }
}

async function handleFileUploadChunk(ws: WebSocket, sessionId: string, data: FileUploadChunkData): Promise<void> {
  try {
    logger.info(`Receiving file chunk ${data.chunkIndex} for session ${sessionId}`);

    const connectionInfo = activeEventConnections.get(ws);
    if (!connectionInfo) {
      throw new Error('Connection info not found');
    }

    // 查找正在进行的上传
    const uploadStates = connectionInfo.config.uploadStates;
    if (!uploadStates) {
      throw new Error('No active file upload');
    }

    // 获取文件名（从上传状态中获取第一个）
    const fileName = Object.keys(uploadStates)[0];
    if (!fileName) {
      throw new Error('No active file upload');
    }

    const uploadState = uploadStates[fileName];

    // 将块数据追加到文件
    const chunkBuffer = Buffer.from(data.chunk, 'base64');
    fs.appendFileSync(uploadState.filePath, chunkBuffer);

    uploadState.receivedChunks++;

    logger.info(`Received chunk ${data.chunkIndex + 1}/${uploadState.totalChunks} for session ${sessionId}`);

    // 如果是最后一个块，清理上传状态
    if (data.isLast) {
      delete uploadStates[fileName];
      logger.info(`File upload completed for session ${sessionId}: ${uploadState.filePath}`);
    }

    // 发送响应
    sendResponse(ws, 'fileUploadChunk', {
      success: true,
      chunkIndex: data.chunkIndex,
    });
  } catch (error) {
    logger.error(`Failed to handle file chunk for session ${sessionId}:`, error);
    sendResponse(ws, 'fileUploadChunk', {
      success: false,
      error: (error as Error).message,
    });
  }
}

// --- 页面内 Focus 监听器辅助函数 (确保幂等性) ---
async function handleRawFocusEvent(page: Page, ws: WebSocket, sessionId: string): Promise<void> {
  logger.info('handleRawFocusEvent', sessionId);
  // Check states before evaluating
  if ((page && page!.isClosed()) || (ws && ws.readyState !== WebSocket.OPEN)) {
    logger.warn(`Page closed or WebSocket not open when handling raw focus for ${sessionId}.`);
    return;
  }
  logger.info(`Handling raw focus event for ${sessionId}. Evaluating page...`);
  try {
    // Evaluate page to get current focused element data *now*
    const focusedElementInfo = await page!.evaluate(() => {
      let frameSelector: string | null = null; // 用于存储 iframe 的选择器
      let activeElement = document.activeElement as HTMLElement & { value?: string };
      if (activeElement && activeElement.tagName === 'IFRAME') {
        frameSelector =
          (activeElement.parentElement
            ? (activeElement.parentElement.id
                ? `${activeElement.parentElement.tagName.toLowerCase()}#${CSS.escape(activeElement.parentElement.id)}`
                : activeElement.parentElement.classList.length > 0
                  ? `${activeElement.parentElement.tagName.toLowerCase()}.${CSS.escape(activeElement.parentElement.classList[0])}`
                  : activeElement.parentElement.tagName.toLowerCase()) + ' > '
            : '') +
          (activeElement.id
            ? `iframe#${CSS.escape(activeElement.id)}`
            : activeElement.classList.length > 0
              ? `iframe.${CSS.escape(activeElement.classList[0])}`
              : 'iframe');

        activeElement = (activeElement as HTMLIFrameElement).contentWindow!.document.activeElement as HTMLElement;
      }
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)
      ) {
        let selector = activeElement.id
          ? `#${CSS.escape(activeElement.id)}`
          : activeElement.getAttribute('name')
            ? `[name="${CSS.escape(activeElement.getAttribute('name')!)}"]`
            : `${activeElement.tagName.toLowerCase()}:nth-child(${Array.from(activeElement.parentNode?.children || []).indexOf(activeElement) + 1})`;
        const tag = activeElement.tagName.toLowerCase();
        const value = activeElement.isContentEditable ? activeElement.innerText : (activeElement.value ?? '');
        const attributes: Record<string, string | boolean | null> = {};
        // ... (extract attributes: id, name, type, placeholder, required, etc.) ...
        if (activeElement.id) attributes.id = activeElement.id;
        if (activeElement.getAttribute('name')) attributes.name = activeElement.getAttribute('name');
        if (tag === 'input' || tag === 'textarea') {
          if (activeElement.getAttribute('type')) attributes.type = activeElement.getAttribute('type');
        }
        if (activeElement.getAttribute('placeholder'))
          attributes.placeholder = activeElement.getAttribute('placeholder');
        if (activeElement.hasAttribute('required')) attributes.required = true;
        if (activeElement.hasAttribute('disabled')) attributes.disabled = true;
        if (activeElement.hasAttribute('readonly')) attributes.readonly = true;
        if (activeElement.getAttribute('aria-label'))
          attributes['aria-label'] = activeElement.getAttribute('aria-label');
        return {
          selector,
          frameSelector: frameSelector, // 如果不在 frame 中，此值为 null
          tag,
          value,
          ...attributes,
        };
      }
      return null;
    });

    // Send notification if data was collected and WS is open
    if (focusedElementInfo && ws.readyState === WebSocket.OPEN) {
      logger.debug(`Sending form.field notification for ${sessionId}`);
      // Assuming sendNotification exists and works correctly
      sendNotification(ws, 'form.field', focusedElementInfo);
    } else if (ws.readyState === WebSocket.OPEN) {
      logger.debug(`No suitable element focused when evaluating for ${sessionId}.`);
    }
  } catch (evalError) {
    if (!page!.isClosed() && ws.readyState === WebSocket.OPEN) {
      logger.error(`Error evaluating focus state for session ${sessionId} after raw event:`, evalError);
    }
  }
}

// --- 消息处理函数 ---
async function handleIncomingEventMessage(ws: WebSocket, message: RawData): Promise<void> {
  const connectionInfo = activeEventConnections.get(ws);
  if (!connectionInfo) {
    logger.warn('Received message for a non-tracked WebSocket connection.');
    return;
  }
  const { page, sessionId } = connectionInfo;
  if (page.isClosed()) {
    logger.warn(`Received message for session ${sessionId}, but page is closed.`);
    cleanupEventConnection(ws);
    return;
  }

  let eventType = 'unknown'; // For error reporting
  let requestType = 'unknown'; // For response

  try {
    const eventData = JSON.parse(message.toString());

    eventType = eventData.type; // Actual event type from message
    requestType = eventType; // Use eventType for response tracking
    const data = eventData.data;

    logger.debug(`Received event from session ${sessionId}:`, eventType, data);

    switch (eventType) {
      // --- 文件上传 ---
      case 'fileUploadStart':
        await handleFileUploadStart(ws, sessionId, data);
        break;

      case 'fileUploadChunk':
        await handleFileUploadChunk(ws, sessionId, data);
        break;

      // --- 配置更新 ---
      case 'updateClip':
      // falls through to event handler
      // --- 程序化接口 ---
      case 'event': {
        const innerEvent = eventData.event || eventData;
        const innerType = innerEvent.type || '';
        const innerData = innerEvent.data || {};

        const nameMap: Record<string, string> = {
          click: 'mouseClick',
          mousedown: 'mouseDown',
          mouseup: 'mouseUp',
          mousemove: 'mouseMove',
          wheel: 'mouseWheel',
          keydown: 'keyDown',
          keyup: 'keyUp',
          touchstart: 'touchStart',
          touchmove: 'touchMove',
          touchend: 'touchEnd',
          contextmenu: 'contextMenu',
        };

        const mappedType = nameMap[innerType] || innerType;

        const normalizedData = {
          ...innerData,
          type: mappedType,
        };

        handleMouseEvents(mappedType, normalizedData, page, ws, sessionId, requestType);
        break;
      }

      case 'fileInjectInBrowser':
        await handleFileInjectInBrowser(ws, sessionId, data);
        break;

      case 'tab': {
        const tabAction = eventData.action || eventData.data?.action;

        if (tabAction === 'list') {
          try {
            const session = (browserService as any).sessions.get(sessionId);
            if (session?.browser) {
              const pages = await session.browser.pages();
              const currentPage = await browserService.getSessionPage(sessionId);
              const tabs = await Promise.all(
                pages
                  .filter((p: Page) => !p.isClosed() && !p.url().startsWith('devtools://'))
                  .map(async (p: Page) => ({
                    id: p.url(),
                    url: p.url(),
                    title: await p.title().catch(() => ''),
                    active: p === currentPage,
                  }))
              );
              ws.send(JSON.stringify({ type: 'tabList', tabs }));
            }
          } catch (tabError) {
            logger.error(`Failed to list tabs for session ${sessionId}:`, tabError);
          }
        } else if (tabAction === 'switch') {
          const targetUrl = eventData.tabId || eventData.data?.tabId;
          try {
            const session = (browserService as any).sessions.get(sessionId);
            if (session?.browser) {
              const pages = await session.browser.pages();
              const target = pages.find(
                (p: Page) => !p.isClosed() && (p.url() === targetUrl || p.target().url() === targetUrl)
              );
              if (target) {
                await target.bringToFront();
                browserService.emit('tabSwitched', sessionId, target);
                sendResponse(ws, 'tab', { success: true });
              } else {
                sendResponse(ws, 'tab', { success: false, error: 'Target tab not found' });
              }
            }
          } catch (switchError) {
            logger.error(`Failed to switch tab for session ${sessionId}:`, switchError);
            sendResponse(ws, 'tab', { success: false, error: (switchError as Error).message });
          }
        } else if (tabAction === 'close') {
          const targetUrl = eventData.tabId || eventData.data?.tabId;
          try {
            const session = (browserService as any).sessions.get(sessionId);
            if (session?.browser) {
              const pages = await session.browser.pages();
              const target = pages.find(
                (p: Page) => !p.isClosed() && (p.url() === targetUrl || p.target().url() === targetUrl)
              );
              if (target && pages.length > 1) {
                await target.close();
                sendResponse(ws, 'tab', { success: true });
              } else {
                sendResponse(ws, 'tab', { success: false, error: 'Cannot close the only tab' });
              }
            }
          } catch (closeTabError) {
            logger.error(`Failed to close tab for session ${sessionId}:`, closeTabError);
            sendResponse(ws, 'tab', { success: false, error: (closeTabError as Error).message });
          }
        }
        break;
      }

      // --- 其他指令 ---
      case 'page.goto':
      case 'navigate':
        try {
          if (data?.action) {
            switch (data.action) {
              case 'goBack':
                await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
                break;
              case 'goForward':
                await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
                break;
              case 'reload':
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
                break;
            }
            logger.info(`Navigate action ${data.action} for session ${sessionId}`);
          } else {
            logger.info(`Navigating page for session ${sessionId} to ${data?.url}`);
            await page.goto(data?.url, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });
          }
          sendResponse(ws, requestType, { success: true });
        } catch (gotoError) {
          logger.error(`Failed navigate for ${sessionId}:`, gotoError);
          sendResponse(ws, requestType, {
            success: false,
            error: (gotoError as Error).message,
          });
        }
        break;

      case 'goBack':
        try {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
          sendResponse(ws, requestType, { success: true });
        } catch (backError) {
          sendResponse(ws, requestType, { success: false, error: (backError as Error).message });
        }
        break;

      case 'goForward':
        try {
          await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
          sendResponse(ws, requestType, { success: true });
        } catch (fwdError) {
          sendResponse(ws, requestType, { success: false, error: (fwdError as Error).message });
        }
        break;

      case 'reload':
        try {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
          sendResponse(ws, requestType, { success: true });
        } catch (reloadError) {
          sendResponse(ws, requestType, { success: false, error: (reloadError as Error).message });
        }
        break;

      case 'mousemove':
      case 'mousedown':
      case 'mouseup':
      case 'click':
      case 'wheel':
      case 'keydown':
      case 'keyup': {
        const nameMap: Record<string, string> = {
          mousemove: 'mouseMove',
          mousedown: 'mouseDown',
          mouseup: 'mouseUp',
          click: 'mouseClick',
          wheel: 'mouseWheel',
          keydown: 'keyDown',
          keyup: 'keyUp',
        };
        const mappedType = nameMap[eventType] || eventType;
        handleMouseEvents(mappedType, data || {}, page, ws, sessionId, requestType);
        break;
      }

      default:
        logger.warn(`Unhandled event type received: ${eventType}`);
        sendResponse(ws, requestType, {
          success: false,
          error: `Unhandled event type: ${eventType}`,
        });
    }
  } catch (error) {
    // Outer catch for JSON parsing or unexpected errors
    logger.error(
      `Failed to parse or handle incoming message for session ${sessionId} (event type: ${eventType}):`,
      error
    );
    sendResponse(ws, requestType, {
      success: false,
      error: `Failed to process message: ${(error as Error).message}`,
    });
    if ((error as Error).message.includes('Target closed')) {
      handlePageCloseOrCrash(ws, sessionId, 'browser_closed');
    }
  }
}

async function handleMouseEvents(
  eventType: string,
  data: MouseEventData,
  page: Page,
  ws: WebSocket,
  sessionId: string,
  requestType: string
): Promise<void> {
  try {
    switch (eventType) {
      case 'input': {
        let targetContext: Page | Frame = page;
        const { selector, frameSelector, value } = data;
        if (!selector && value) {
          await page.keyboard.type(value, { delay: 50 });
          sendResponse(ws, requestType, { success: true });
          return;
        }
        if (!selector) {
          return;
        }

        if (frameSelector) {
          const iframeHandle = await page
            .waitForSelector(frameSelector, { visible: true, timeout: 5000 })
            .catch((error) => {
              logger.error(`Failed to find iframe for session ${sessionId}:`, error);
              return null;
            });
          if (!iframeHandle) {
            return;
          }
          targetContext = (await iframeHandle.contentFrame())!;
        }

        try {
          await targetContext.waitForSelector(selector, {
            visible: true,
            timeout: 5000,
          });
          await targetContext.focus(selector);
          await targetContext.evaluate((sel) => {
            const input = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
            if (input) input.value = '';
            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
          }, selector);

          await targetContext.type(selector, value ?? '', { delay: 30 + Math.random() * 50 });
          logger.info(`Successfully filled input for session ${sessionId}`);
          sendResponse(ws, requestType, { success: true });
        } catch (fillError) {
          logger.error(`Failed to fill input for session ${sessionId} (${selector}):`, fillError);
          sendResponse(ws, requestType, {
            success: false,
            error: (fillError as Error).message,
          });
        }
        break;
      }
      case 'mouseWheel':
        logger.info('mouseWheel', data);
        await page.mouse.wheel({
          deltaX: data.deltaX,
          deltaY: data.deltaY,
        });
        break;

      case 'contextMenu': {
        const { x = 0, y = 0 } = data;
        const coords = browserService.getTransformedCoordinates(sessionId, x, y);
        if (coords) {
          await page.mouse.click(coords.tx, coords.ty, { button: 'right' });
        }
        break;
      }

      // --- 基础交互事件 ---
      case 'mouseClick':
      case 'mouseMove':
      case 'mouseDown':
      case 'mouseUp':
      case 'keyDown':
      case 'keyUp':
      case 'keyPress':
        try {
          // Determine coordinates if needed
          let coords: { tx: number; ty: number } | null = null;
          if (['mouseClick', 'mouseMove', 'mouseDown', 'mouseUp'].includes(eventType)) {
            logger.debug(`data: ${JSON.stringify(data)}`);
            coords = browserService.getTransformedCoordinates(sessionId, data.x ?? 0, data.y ?? 0);
            if (!coords) throw new Error('Cannot get transformed coordinates');
          }
          logger.info(eventType, `Coords: ${JSON.stringify(coords)}`);

          switch (eventType) {
            case 'mouseMove':
              if (!coords) throw new Error('Coordinates required for mouseMove');
              await page.mouse.move(coords.tx, coords.ty, { steps: 3 });
              break;
            case 'mouseDown':
              // logger.info('mouseDown',coords);
              if (!coords) throw new Error(`Coordinates required for ${eventType}`);
              await page.mouse.move(coords.tx, coords.ty, { steps: 1 });
              await page.mouse.down();
              break;
            case 'mouseUp':
              await page.mouse.up();
              break;
            case 'mouseClick':
              if (!coords) throw new Error('Coordinates required for click');
              await page.mouse
                .click(coords.tx, coords.ty, {
                  clickCount: data.clickCount || 1,
                  // delay: 30 + Math.random() * 40,
                })
                .catch((error) => {
                  logger.error(`Failed to click for session ${sessionId}:`, error);
                });
              break;

            case 'keyDown':
              if (data.key) await page.keyboard.down(data.key as any);
              break;
            case 'keyUp':
              if (data.key) await page.keyboard.up(data.key as any);
              break;
            case 'keyPress':
              if (data.key) await page.keyboard.press(data.key as any);
              break;
            // Ignore touch events in touchpad mode?
            default:
              logger.warn(`Unhandled event type in touchpad mode: ${eventType}`);
              break;
          }
          // If simulation succeeded
          sendResponse(ws, requestType, { success: true });
        } catch (simError) {
          logger.error(`Failed to handle event ${eventType} for session ${sessionId}:`, simError);
          sendResponse(ws, requestType, {
            success: false,
            error: (simError as Error).message,
          });
        }
    }
  } catch (error) {
    logger.error(`Failed to handle mouse event for session ${sessionId}:`, error);
    sendResponse(ws, requestType, {
      success: false,
      error: (error as Error).message,
    });
  }
}

// --- 清理函数 ---
function cleanupEventConnection(ws: WebSocket): void {
  const connectionInfo = activeEventConnections.get(ws);
  if (connectionInfo) {
    const { page, sessionId, listeners } = connectionInfo;
    logger.info(`Cleaning up '/events' connection for session ${sessionId}`);

    if ((connectionInfo as any)._clipboardPollInterval) {
      clearInterval((connectionInfo as any)._clipboardPollInterval);
    }
    const functionName = '_emitFocusEvent_' + sessionId.replace(/\W/g, '_');

    // 移除 Page 监听器
    if (!page.isClosed()) {
      if (listeners.pageCloseHandler) page.off('close', listeners.pageCloseHandler);
      if (listeners.pageCrashHandler) page.off('crash', listeners.pageCrashHandler);
      if (listeners.frameNavigatedHandler) page.off('framenavigated', listeners.frameNavigatedHandler);
      // 尝试移除页面内的 focus 监听器 (使用 flag 检查)
      page
        .evaluate((fnName) => {
          const win = window as unknown as Record<string, unknown>;
          const flagName = `_focusListenerAttached_${fnName}`;
          if (win[flagName]) {
            // Only remove if attached by this logic
            if (win[fnName]) {
              document.removeEventListener('focusin', win[fnName] as EventListener);
            }
            win[flagName] = false; // Reset the flag
            logger.debug('Focus listener removed from page context.');
          }
        }, functionName)
        .catch(() => {
          /* Ignore errors during cleanup */
        });
      // !! 如何安全地移除 exposeFunction 绑定的函数是 Puppeteer 的一个挑战 !!
      // 通常页面关闭会自动清理，或者需要更复杂的追踪
    }

    // 移除 browserService 监听器
    if (listeners.configUpdateListener) {
      browserService.off('configUpdated', listeners.configUpdateListener);
      logger.debug(`Removed browserService 'configUpdated' listener for ${sessionId}`);
    }

    activeEventConnections.delete(ws);
    logger.info(`'/events' connection removed for session ${sessionId}. Remaining: ${activeEventConnections.size}`);
  } else {
    logger.warn('Cleanup called for a non-tracked WebSocket connection.');
  }
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close(1000, 'Event cleanup complete');
  }
}

// --- 辅助发送函数 ---
function sendNotification(ws: WebSocket, eventType: string, data: Record<string, unknown> | null): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: eventType || 'notification',
        event: { type: eventType, ...data },
      }),
      (err) => {
        if (err) logger.error(`Failed to send notification (${eventType}):`, err);
      }
    );
  }
}

function sendConfigSync(ws: WebSocket, config: SessionConfig): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'configSync', config }), (err) => {
      if (err) logger.error('Failed to send configSync:', err);
      else logger.debug('Sent configSync:', config);
    });
  }
}

function sendResponse(
  ws: WebSocket,
  requestType: string,
  data: { success: boolean; error?: string; [key: string]: unknown }
): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'response',
        requestType: requestType,
        data: data,
      }),
      (err) => {
        if (err) logger.error(`Failed to send response for ${requestType}:`, err);
      }
    );
  }
}

function sendSessionEndedMessage(ws: WebSocket, reason: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'session_ended', data: { reason } }), (err) => {
      if (err) logger.error('Failed to send session_ended message:', err);
    });
  }
}

async function handleFileInjectInBrowser(
  ws: WebSocket,
  sessionId: string,
  data: { filepath: string; selector: string; frameSelector?: string }
): Promise<void> {
  try {
    const { browserInjectService } = await import('../services/browser-inject.service.js');
    const result = await browserInjectService.injectFile({
      sessionId,
      filePath: data.filepath,
      selector: data.selector,
      frameSelector: data.frameSelector,
    });
    sendResponse(ws, 'fileInjectInBrowser', result);
  } catch (error: unknown) {
    logger.error(`WebSocket 文件注入失败 (session: ${sessionId}):`, error);
    sendResponse(ws, 'fileInjectInBrowser', { success: false, error: (error as Error).message });
  }
}

// --- 页面关闭/崩溃处理 ---
function handlePageCloseOrCrash(ws: WebSocket, sessionId: string, reason: string): void {
  logger.warn(`Page closed or crashed for session ${sessionId}. Reason: ${reason}. Closing '/events' socket.`);
  sendSessionEndedMessage(ws, reason);
  cleanupEventConnection(ws); // 清理时会关闭 socket
}
