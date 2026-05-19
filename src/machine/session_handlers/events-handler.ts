import { WebSocket, RawData } from 'ws';
import { browserService, SessionConfig } from '../browser.service.js';
import { Page, Frame } from 'puppeteer-core';
import { logger } from '@shared/utils/logger.js';
import { sessionFocusEmitter } from '../utils.js';
import { activeEventConnections } from './events-types.js';
import type { EventConnectionInfo } from './events-types.js';
import { sendNotification, sendConfigSync, sendResponse, sendSessionEndedMessage } from './events-helpers.js';
import {
  handleFileUploadStart,
  handleFileUploadChunk,
  handleFileList,
  handleBrowseDir,
  handleGetThumbnail,
  handleFileInjectInBrowser,
  handleInjectFile,
} from './events-file-ops.js';
import { handleRawFocusEvent, mapEventType, mapRawEventType } from './events-focus.js';
import { handleMouseEvents, handleNavigate, handleGoBack, handleGoForward, handleReload } from './events-mouse.js';
import { handleTabAction, handlePaste } from './events-tab.js';

export { activeEventConnections } from './events-types.js';

export async function handleEventsConnection(ws: WebSocket, sessionId: string): Promise<void> {
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

    currentConfig = browserService.getSessionConfig(sessionId);

    if (!currentConfig) {
      logger.error(`Session ${sessionId}: Failed to get initial config. Closing '/events' socket.`);
      ws.close(1011, 'Failed to initialize session config');
      return;
    }

    connectionInfo = {
      page,
      sessionId,
      config: { ...currentConfig },
      listeners: {},
    };
    activeEventConnections.set(ws, connectionInfo);

    let lastClipboardContent = '';
    const clipboardPollInterval = setInterval(async () => {
      const conn = activeEventConnections.get(ws);
      if (!conn || conn.page.isClosed() || ws.readyState !== WebSocket.OPEN) {
        clearInterval(clipboardPollInterval);
        return;
      }
      try {
        const result = await conn.page
          .evaluate(() => {
            const fileEvent = window.__fileInputClickEvent;
            if (fileEvent && Date.now() - fileEvent.timestamp < 3000) {
              window.__fileInputClickEvent = null;
              return { filechooser: true, accept: fileEvent.accept, multiple: fileEvent.multiple };
            }
            const clip = window.__clipboardContent || '';
            return { filechooser: false, clipboard: clip };
          })
          .catch(() => ({ filechooser: false, clipboard: '' }));

        if (result.filechooser) {
          const r = result as { filechooser: true; accept: string | null; multiple: boolean };
          sendNotification(ws, 'filechooser', {
            message: 'Remote browser requests file selection',
            accept: r.accept || null,
            multiple: r.multiple || false,
          });
        } else if (result.clipboard && result.clipboard !== lastClipboardContent) {
          lastClipboardContent = result.clipboard;
          sendNotification(ws, 'clipboard', { text: result.clipboard });
        }
      } catch {
        try {
          const freshPage = await browserService.getSessionPage(sessionId);
          if (freshPage) {
            const conn = activeEventConnections.get(ws);
            if (conn) conn.page = freshPage;
          }
        } catch (_recoverErr: unknown) {
          logger.debug('Failed to recover page for clipboard polling:', (_recoverErr as Error)?.message);
        }
      }
    }, 2000);
    connectionInfo._clipboardPollInterval = clipboardPollInterval;
    logger.info(
      `Stored '/events' connection for session ${sessionId} with initial config: ${JSON.stringify(currentConfig)}`
    );

    sendConfigSync(ws, currentConfig);

    connectionInfo.listeners.pageCloseHandler = () => handlePageCloseOrCrash(ws, sessionId, 'browser_closed');
    connectionInfo.listeners.pageCrashHandler = () => handlePageCloseOrCrash(ws, sessionId, 'browser_crashed');
    connectionInfo.listeners.frameNavigatedHandler = (frame: Frame) => {
      if (page && !page.isClosed() && frame === page.mainFrame()) {
        const url = frame.url();
        if (!url.startsWith('about:') && !url.startsWith('data:')) {
          logger.info(`Navigation detected for session ${sessionId}: ${url}`);
          sendNotification(ws, 'navigationChanged', { url });
        }
      }
    };
    page.once('close', connectionInfo.listeners.pageCloseHandler);
    page.once('crash', connectionInfo.listeners.pageCrashHandler);
    page.on('framenavigated', connectionInfo.listeners.frameNavigatedHandler);
    logger.info(`Attached page listeners for ${sessionId}`);

    const boundFocusHandler = handleRawFocusEvent.bind(null, page, ws, sessionId) as () => void;
    sessionFocusEmitter.off(`rawFocusEvent:${sessionId}`, boundFocusHandler);
    sessionFocusEmitter.on(`rawFocusEvent:${sessionId}`, boundFocusHandler);
    connectionInfo.listeners.rawFocusHandler = boundFocusHandler;
    logger.info(`Subscribed to raw focus events for session ${sessionId}`);

    connectionInfo.listeners.configUpdateListener = (updatedSessionId: string, newConfig: SessionConfig) => {
      if (updatedSessionId === sessionId) {
        const conn = activeEventConnections.get(ws);
        if (conn) {
          logger.info(`Config updated via service for session ${sessionId}:`, newConfig);
          conn.config = { ...newConfig };
          sendConfigSync(ws, newConfig);
        }
      }
    };
    browserService.on('configUpdated', connectionInfo.listeners.configUpdateListener);
    logger.info(`Attached browserService 'configUpdated' listener for ${sessionId}`);

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
  } catch (error: unknown) {
    logger.error(`Error setting up '/events' connection for session ${sessionId}:`, error);
    ws.close(1011, 'Internal server error during event setup');
    if (connectionInfo) {
      cleanupEventConnection(ws);
    } else {
      activeEventConnections.delete(ws);
    }
  }
}

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

  let eventType = 'unknown';
  let requestType = 'unknown';

  try {
    const eventData = JSON.parse(message.toString());

    eventType = eventData.type;
    requestType = eventType;
    const data = eventData.data;

    logger.info(`Received event from session ${sessionId}:`, eventType, data);

    switch (eventType) {
      case 'fileUploadStart':
        await handleFileUploadStart(ws, sessionId, data);
        break;

      case 'fileUploadChunk':
        await handleFileUploadChunk(ws, sessionId, data);
        break;

      case 'fileList':
        await handleFileList(ws, sessionId, requestType);
        break;

      case 'browseDir':
        await handleBrowseDir(ws, eventData, requestType);
        break;

      case 'getThumbnail':
        await handleGetThumbnail(ws, eventData, requestType);
        break;

      case 'updateClip':
      case 'event': {
        const innerEvent = eventData.event || eventData;
        const innerType = innerEvent.type || '';
        const innerData = innerEvent.data || {};

        const mappedType = mapEventType(innerType);

        const normalizedData = {
          ...innerData,
          type: mappedType,
        };

        handleMouseEvents(mappedType, normalizedData, page, ws, sessionId, requestType);
        break;
      }

      case 'paste':
        await handlePaste(ws, sessionId, data, requestType);
        break;

      case 'fileInjectInBrowser':
        await handleFileInjectInBrowser(ws, sessionId, data);
        break;

      case 'injectFile':
        await handleInjectFile(ws, sessionId, eventData, page);
        break;

      case 'tab':
        await handleTabAction(ws, sessionId, page, eventData, requestType);
        break;

      case 'page.goto':
      case 'navigate':
        await handleNavigate(ws, sessionId, page, data, requestType);
        break;

      case 'goBack':
        await handleGoBack(ws, page, requestType);
        break;

      case 'goForward':
        await handleGoForward(ws, page, requestType);
        break;

      case 'reload':
        await handleReload(ws, page, requestType);
        break;

      case 'mousemove':
      case 'mousedown':
      case 'mouseup':
      case 'click':
      case 'wheel':
      case 'keydown':
      case 'keyup': {
        const mappedType = mapRawEventType(eventType);
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
  } catch (error: unknown) {
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

function cleanupEventConnection(ws: WebSocket): void {
  const connectionInfo = activeEventConnections.get(ws);
  if (connectionInfo) {
    const { page, sessionId, listeners } = connectionInfo;
    logger.info(`Cleaning up '/events' connection for session ${sessionId}`);

    if (connectionInfo._clipboardPollInterval) {
      clearInterval(connectionInfo._clipboardPollInterval);
    }
    const functionName = '_emitFocusEvent_' + sessionId.replace(/\W/g, '_');

    if (!page.isClosed()) {
      if (listeners.pageCloseHandler) page.off('close', listeners.pageCloseHandler);
      if (listeners.pageCrashHandler) page.off('crash', listeners.pageCrashHandler);
      if (listeners.frameNavigatedHandler) page.off('framenavigated', listeners.frameNavigatedHandler);
      page
        .evaluate((fnName) => {
          const win = window as unknown as Record<string, unknown>;
          const flagName = `_focusListenerAttached_${fnName}`;
          if (win[flagName]) {
            if (win[fnName]) {
              document.removeEventListener('focusin', win[fnName] as EventListener);
            }
            win[flagName] = false;
          }
        }, functionName)
        .catch((e: unknown) => {
          logger.debug('Error removing focus listener during cleanup:', (e as Error)?.message);
        });
    }

    if (listeners.configUpdateListener) {
      browserService.off('configUpdated', listeners.configUpdateListener);
      logger.info(`Removed browserService 'configUpdated' listener for ${sessionId}`);
    }

    if (listeners.rawFocusHandler) {
      sessionFocusEmitter.off(`rawFocusEvent:${sessionId}`, listeners.rawFocusHandler);
      logger.info(`Removed rawFocusEvent listener for ${sessionId}`);
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

function handlePageCloseOrCrash(ws: WebSocket, sessionId: string, reason: string): void {
  logger.warn(`Page closed or crashed for session ${sessionId}. Reason: ${reason}. Closing '/events' socket.`);
  sendSessionEndedMessage(ws, reason);
  cleanupEventConnection(ws);
}
