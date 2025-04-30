import { WebSocket, RawData } from 'ws';
import { browserService, SessionConfig } from '../browser.service.js';
import { Page, Frame } from 'puppeteer-core';
import { logger } from '../../utils/logger.js';

// !! 扩展 Window 接口以包含自定义函数 !!
declare global {
    interface Window {
        _mouseTrackingInjected?: boolean;
        updateMousePosition?: (x: number, y: number, viewportWidth: number, viewportHeight: number) => void;
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
        frameNavigatedHandler?: (frame: Frame) => void;
        configUpdateListener?: (sessionId: string, newConfig: SessionConfig) => void;
        // 页面内 focus 监听器理论上随页面关闭，但保留引用以明确
        focusListenerAttached?: boolean;
    }
}
const activeEventConnections = new Map<WebSocket, EventConnectionInfo>();

// !! 硬编码触摸模式 !!
const HARDCODED_TOUCH_MODE: 'touchpad' | 'touch' = 'touchpad'; // 默认使用类似鼠标的 'touchpad' 模式

// == 定义鼠标追踪脚本 ==
const mouseTrackingScript = `
  (() => {
    if (window._mouseTrackingInjected) return;
    window._mouseTrackingInjected = true;
    console.log('Injecting mouse tracker script...');
    let cursorElement = document.createElement('div');
    cursorElement.id = 'remote-mouse-cursor';
    cursorElement.style.position = 'fixed';
    cursorElement.style.width = '10px';
    cursorElement.style.height = '10px';
    cursorElement.style.borderRadius = '50%';
    cursorElement.style.backgroundColor = 'red';
    cursorElement.style.opacity = '0.7';
    cursorElement.style.zIndex = '999999';
    cursorElement.style.pointerEvents = 'none';
    cursorElement.style.display = 'none';
    cursorElement.style.transition = 'transform 0.05s linear'; // Faster, linear transition
    document.body.appendChild(cursorElement);
    window.updateMousePosition = (x, y, viewportWidth, viewportHeight) => {
      if (cursorElement.style.display === 'none') {
         cursorElement.style.display = 'block';
      }
      // Use translate for smoother animation
      cursorElement.style.transform = \`translate(\${x}px, \${y}px)\`;
    };
    console.log('Mouse tracker script injected and ready.');
  })();
`;

export async function handleEventsConnection(
    ws: WebSocket,
    sessionId: string,
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
            listeners: {}
        };
        activeEventConnections.set(ws, connectionInfo);
        logger.info(`Stored '/events' connection for session ${sessionId} with initial config: ${JSON.stringify(currentConfig)}`);

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
        await attachFocusListener(page, ws, sessionId);
        // connectionInfo.listeners.focusListenerAttached = true; // 标记由 attachFocusListener 内部管理

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
        if(connectionInfo){ // 如果 connectionInfo 已创建，尝试清理
           cleanupEventConnection(ws);
        } else { // 否则，至少从 Map 中删除 ws （如果已添加）
           activeEventConnections.delete(ws);
        }
    }
}

// --- 页面内 Focus 监听器辅助函数 (确保幂等性) ---
async function attachFocusListener(page: Page, ws: WebSocket, sessionId: string): Promise<void> {
    if (page.isClosed()) return;
    try {
        const functionName = '_emitFocusEvent_' + sessionId.replace(/\W/g, '_'); // Session-specific name
        let alreadyExposed = false;
        // 检查函数是否已被暴露 (注意：exposeFunction 可能没有提供检查方法，这里假设覆盖是安全的或需要try-catch)
        try {
           await page.exposeFunction(functionName, () => {
                 if (page.isClosed()) return;
                 page.evaluate(() => {
                    const activeElement = document.activeElement as HTMLElement;
                    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
                        let selector = activeElement.id ? `#${CSS.escape(activeElement.id)}` : null;
                        if (!selector) selector = activeElement.getAttribute('name') ? `[name="${CSS.escape(activeElement.getAttribute('name')!)}"]` : null;
                        if (!selector) selector = `${activeElement.tagName.toLowerCase()}`;
                        return {
                            selector: selector,
                            elementType: activeElement.tagName.toLowerCase(),
                        };
                    }
                    return null;
                }).then(focusedElementInfo => {
                    if (focusedElementInfo) {
                        logger.debug(`Element focused in session ${sessionId}:`, focusedElementInfo);
                        sendNotification(ws, 'elementFocused', focusedElementInfo);
                    }
                }).catch(evalError => {
                     if (!page.isClosed()) {
                        logger.warn(`Error evaluating focus state in session ${sessionId}:`, evalError);
                     }
                });
            });
        } catch (exposeError: any) {
             // 如果暴露失败，可能是因为同名函数已存在，可以尝试忽略
             if (exposeError.message.includes('already exists')) {
                 logger.warn(`Focus event function ${functionName} already exposed for session ${sessionId}.`);
                 alreadyExposed = true;
             } else {
                 throw exposeError; // Re-throw other errors
             }
        }

        // 在页面内附加 focusin 监听器 (使用 flag 确保只添加一次)
        await page.evaluate((fnName) => {
            const win = window as any;
            const flagName = `_focusListenerAttached_${fnName}`;
            if (!win[flagName]) { // Check the flag
                if (win[fnName]) { // Check if function exists on window
                    document.addEventListener('focusin', win[fnName]);
                    win[flagName] = true; // Set the flag
                    logger.debug('Focus listener attached in page context.');
                } else {
                    logger.warn('Focus emitter function not found on window during listener attachment.');
                }
            } else {
                 logger.debug('Focus listener already attached in page context.');
            }
        }, functionName); // Pass the dynamic function name
        logger.info(`Attached focus listener logic for session ${sessionId}`);
    } catch (error) {
        logger.error(`Failed to attach focus listener for session ${sessionId}:`, error);
    }
}

// --- 消息处理函数 ---
async function handleIncomingEventMessage(ws: WebSocket, message: RawData): Promise<void> {
    const connectionInfo = activeEventConnections.get(ws);
    if (!connectionInfo) {
        logger.warn('Received message for a non-tracked WebSocket connection.');
        return;
    }
    const { page, sessionId, config } = connectionInfo; // Use cached config
    if (page.isClosed()){
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
            // --- 配置更新 ---
            case 'updateClip':
            case 'setInteractionMode': {
                const updatePayload: Partial<SessionConfig> = {};
                if (eventType === 'updateClip') {
                   updatePayload.clip = data;
                } else {
                   updatePayload.interactionMode = data.mode;
                   // Optional: Update touchMode based on interactionMode if not provided
                   // if (data.touchMode === undefined) {
                   //    updatePayload.touchMode = (data.mode === 'captcha_slider') ? 'touch' : 'touchpad';
                   // }
                }
                const updated = browserService.updateSessionConfig(sessionId, updatePayload);
                // configUpdated event triggers configSync
                sendResponse(ws, requestType, { success: updated });
                break;
            }
             case 'resetView': {
                const updated = browserService.updateSessionConfig(sessionId, { clip: undefined });
                sendResponse(ws, requestType, { success: updated });
                break;
             }

            // --- 程序化接口 ---
            case 'fillInput': {
                const { selector, text } = data;
                try {
                    await page.waitForSelector(selector, { visible: true, timeout: 5000 });
                    await page.focus(selector);
                    await page.evaluate((sel) => {
                        const input = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
                        if (input) input.value = '';
                    }, selector);
                    await page.type(selector, text, { delay: 30 + Math.random() * 50 });
                    logger.info(`Successfully filled input for session ${sessionId}`);
                    sendResponse(ws, requestType, { success: true });
                } catch (fillError) {
                    logger.error(`Failed to fill input for session ${sessionId} (${selector}):`, fillError);
                    sendResponse(ws, requestType, { success: false, error: (fillError as Error).message });
                }
                break;
            }

            // --- 基础交互事件 ---
            case 'click':
            case 'mousemove':
            case 'mousedown':
            case 'mouseup':
            case 'wheel':
            case 'keydown':
            case 'keyup':
            case 'keypress':
            case 'type': // Note: 'type' might conflict with fillInput, prefer keyboard.type?
            case 'scroll':
            case 'touch.start':
            case 'touch.move':
            case 'touch.end':
            case 'touch.tap':
            {
                 try {
                    // Determine coordinates if needed
                    let coords: { tx: number, ty: number } | null = null;
                    if (['click', 'mousemove', 'mousedown', 'mouseup', 'touch.start', 'touch.move', 'touch.tap'].includes(eventType)) {
                       coords = browserService.getTransformedCoordinates(sessionId, data.x, data.y);
                       if (!coords) throw new Error("Cannot get transformed coordinates");
                    }

                    // Simulate based on touchMode
                    if (config.touchMode === 'touch') {
                        if (!coords && ['touch.start', 'touch.move', 'touch.tap'].includes(eventType)) {
                           throw new Error(`Coordinates required for ${eventType}`);
                        }
                        switch (eventType) {
                            case 'touch.start': await page.touchscreen.touchStart(coords!.tx, coords!.ty); break;
                            case 'touch.move': await page.touchscreen.touchMove(coords!.tx, coords!.ty); break;
                            case 'touch.end': await page.touchscreen.touchEnd(); break; // No coords needed
                            case 'touch.tap': await page.touchscreen.tap(coords!.tx, coords!.ty); break;
                             // Ignore mouse/keyboard events in touch mode? Or map them? For now, ignore.
                            case 'click': // Map click to tap in touch mode
                                logger.debug(`Mapping click to tap in touch mode for ${sessionId}`);
                                await page.touchscreen.tap(coords!.tx, coords!.ty);
                                break;
                            default: logger.warn(`Unhandled event type in touch mode: ${eventType}`); break; // Or throw error?
                        }
                    } else { // touchpad mode (simulates mouse/keyboard)
                        switch (eventType) {
                            case 'mousemove':
                                if (!coords) throw new Error("Coordinates required for mousemove");
                                await page.mouse.move(coords.tx, coords.ty, { steps: 3 });
                                break;
                            case 'mousedown':
                            case 'mouseup':
                                if (!coords) throw new Error(`Coordinates required for ${eventType}`);
                                await page.mouse.move(coords.tx, coords.ty, { steps: 1 });
                                await page.mouse[eventType === 'mousedown' ? 'down' : 'up']();
                                break;
                            case 'click':
                                if (!coords) throw new Error("Coordinates required for click");
                                await page.mouse.click(coords.tx, coords.ty, { button: data.button || 'left', clickCount: data.clickCount || 1, delay: 30 + Math.random() * 40 });
                                break;
                            case 'wheel':
                                await page.mouse.wheel({ deltaX: data.deltaX || 0, deltaY: data.deltaY || 0 });
                                break;
                            case 'keydown':
                            case 'keyup':
                            case 'keypress':
                                await page.keyboard[eventType.split('.')[1] as 'down' | 'up' | 'press'](data.key);
                                break;
                            case 'type': // Assume 'type' means typing text like keyboard.type
                                await page.keyboard.type(data.text, { delay: 20 + Math.random() * 30 });
                                break;
                            case 'scroll': // Page scroll
                                await page.evaluate((dx, dy) => window.scrollBy(dx, dy), data.deltaX || 0, data.deltaY || 0);
                                break;
                            // Ignore touch events in touchpad mode?
                            default: logger.warn(`Unhandled event type in touchpad mode: ${eventType}`); break;
                        }
                    }
                    // If simulation succeeded
                    sendResponse(ws, requestType, { success: true });

                 } catch (simError) {
                     logger.error(`Failed to handle event ${eventType} for session ${sessionId}:`, simError);
                     sendResponse(ws, requestType, { success: false, error: (simError as Error).message });
                 }
                 break;
            }

             // --- (可选) 鼠标追踪注入 ---
            case 'inject_mouse_tracker': {
                try {
                    logger.info(`Injecting mouse tracker for session ${sessionId}`);
                    // Inject script into the main frame
                    await page.evaluate(mouseTrackingScript);
                    // Optionally inject into all existing frames if needed
                    // for (const frame of page.frames()) {
                    //    try { await frame.evaluate(mouseTrackingScript); } catch {}
                    // }
                    // Inject into future frames (might be redundant if targetcreated handles it)
                    // await page.evaluateOnNewDocument(mouseTrackingScript);
                    logger.info(`Mouse tracker injected successfully for session ${sessionId}`);
                    sendResponse(ws, requestType, { success: true });
                } catch (injectError) {
                    logger.error(`Failed to inject mouse tracker for session ${sessionId}:`, injectError);
                    sendResponse(ws, requestType, { success: false, error: (injectError as Error).message });
                }
                break;
            }

            // --- 其他指令 ---
            case 'page.goto':
                try {
                   logger.info(`Navigating page for session ${sessionId} to ${data.url}`);
                   await page.goto(data.url, { waitUntil: 'networkidle0', timeout: 60000 }); // Add options
                   sendResponse(ws, requestType, { success: true });
                } catch(gotoError) {
                   logger.error(`Failed page.goto for ${sessionId}:`, gotoError);
                   sendResponse(ws, requestType, { success: false, error: (gotoError as Error).message });
                }
                break;

            default:
                logger.warn(`Unhandled event type received: ${eventType}`);
                sendResponse(ws, requestType, { success: false, error: `Unhandled event type: ${eventType}` });
        }

    } catch (error) { // Outer catch for JSON parsing or unexpected errors
        logger.error(`Failed to parse or handle incoming message for session ${sessionId} (event type: ${eventType}):`, error);
        sendResponse(ws, requestType, { success: false, error: `Failed to process message: ${(error as Error).message}` });
        if ((error as Error).message.includes('Target closed')) {
           handlePageCloseOrCrash(ws, sessionId, 'browser_closed');
        }
    }
}

// --- 清理函数 ---
function cleanupEventConnection(ws: WebSocket): void {
    const connectionInfo = activeEventConnections.get(ws);
    if (connectionInfo) {
        const { page, sessionId, listeners } = connectionInfo;
        logger.info(`Cleaning up '/events' connection for session ${sessionId}`);
        const functionName = '_emitFocusEvent_' + sessionId.replace(/\W/g, '_');

        // 移除 Page 监听器
        if (!page.isClosed()) {
            if (listeners.pageCloseHandler) page.off('close', listeners.pageCloseHandler);
            if (listeners.pageCrashHandler) page.off('crash', listeners.pageCrashHandler);
            if (listeners.frameNavigatedHandler) page.off('framenavigated', listeners.frameNavigatedHandler);
            // 尝试移除页面内的 focus 监听器 (使用 flag 检查)
            page.evaluate((fnName) => {
              const win = window as any;
              const flagName = `_focusListenerAttached_${fnName}`;
              if (win[flagName]) { // Only remove if attached by this logic
                if (win[fnName]) {
                    document.removeEventListener('focusin', win[fnName]);
                }
                win[flagName] = false; // Reset the flag
                logger.debug('Focus listener removed from page context.');
              }
            }, functionName).catch(()=>{ /* Ignore errors during cleanup */ });
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
         logger.warn("Cleanup called for a non-tracked WebSocket connection.");
    }
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
       ws.close(1000, 'Event cleanup complete');
    }
}

// --- 辅助发送函数 ---
function sendNotification(ws: WebSocket, eventType: string, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'notification', event: { type: eventType, ...data } }), (err) => {
            if (err) logger.error(`Failed to send notification (${eventType}):`, err);
        });
    }
}

function sendConfigSync(ws: WebSocket, config: SessionConfig): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'configSync', config }), (err) => {
             if (err) logger.error("Failed to send configSync:", err);
             else logger.debug("Sent configSync:", config);
        });
    }
}

function sendResponse(ws: WebSocket, requestType: string, data: { success: boolean, error?: string, [key: string]: any }): void {
     if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'response', requestType: requestType, data: data }), (err) => {
             if (err) logger.error(`Failed to send response for ${requestType}:`, err);
        });
    }
}

function sendSessionEndedMessage(ws: WebSocket, reason: string): void {
    if (ws.readyState === WebSocket.OPEN) {
       ws.send(JSON.stringify({ type: 'session_ended', data: { reason } }), (err) => {
           if (err) logger.error("Failed to send session_ended message:", err);
       });
    }
}

// --- 页面关闭/崩溃处理 ---
function handlePageCloseOrCrash(ws: WebSocket, sessionId: string, reason: string): void {
  logger.warn(`Page closed or crashed for session ${sessionId}. Reason: ${reason}. Closing '/events' socket.`);
  sendSessionEndedMessage(ws, reason);
  cleanupEventConnection(ws); // 清理时会关闭 socket
}

// 可选： function sendErrorMessage(ws: WebSocket, message: string): void { ... } 