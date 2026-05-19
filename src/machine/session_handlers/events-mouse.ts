import { WebSocket } from 'ws';
import { Page, Frame } from 'puppeteer-core';
import { browserService } from '../browser.service.js';
import { logger } from '@shared/utils/logger.js';
import { sendResponse } from './events-helpers.js';
import type { KeyInput, MouseEventData } from './events-types.js';

export async function handleMouseEvents(
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
        const { selector, frameSelector, value, replace } = data;
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
            .catch((error: unknown) => {
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
            timeout: 5000,
          });

          if (replace) {
            await targetContext.evaluate(
              (sel: string, val: string) => {
                const input = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
                if (input) {
                  input.focus();
                  input.select();
                  if (val) {
                    if (document.queryCommandSupported('insertText')) {
                      document.execCommand('insertText', false, val);
                    } else {
                      input.value = val;
                    }
                  } else {
                    if (document.queryCommandSupported('delete')) {
                      document.execCommand('delete');
                    } else {
                      input.value = '';
                    }
                  }
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              },
              selector,
              value ?? ''
            );
          } else {
            await targetContext.focus(selector);
            await targetContext.evaluate((sel: string) => {
              const input = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
              if (input) input.value = '';
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }, selector);
            await targetContext.type(selector, value ?? '', { delay: 30 + Math.random() * 50 });
          }

          logger.info(`Successfully filled input for session ${sessionId}`);
          sendResponse(ws, requestType, { success: true });
        } catch (fillError: unknown) {
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

      case 'mouseClick':
      case 'mouseMove':
      case 'mouseDown':
      case 'mouseUp':
      case 'keyDown':
      case 'keyUp':
      case 'keyPress':
        try {
          let coords: { tx: number; ty: number } | null = null;
          if (['mouseClick', 'mouseMove', 'mouseDown', 'mouseUp'].includes(eventType)) {
            logger.info(`data: ${JSON.stringify(data)}`);
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
                })
                .catch((error: unknown) => {
                  logger.error(`Failed to click for session ${sessionId}:`, error);
                });
              break;

            case 'keyDown':
              if (data.key) {
                const hasModifier = data.ctrlKey || data.metaKey || data.shiftKey || data.altKey;
                if (hasModifier) {
                  const parts: string[] = [];
                  if (data.ctrlKey || data.metaKey) parts.push('Control');
                  if (data.shiftKey) parts.push('Shift');
                  if (data.altKey) parts.push('Alt');
                  parts.push(data.key);
                  await page.keyboard.press(parts.join('+') as KeyInput);
                } else {
                  await page.keyboard.down(data.key as KeyInput);
                }
              }
              break;
            case 'keyUp':
              if (data.key) {
                const hasModifier = data.ctrlKey || data.metaKey || data.shiftKey || data.altKey;
                if (!hasModifier) {
                  await page.keyboard.up(data.key as KeyInput);
                }
              }
              break;
            case 'keyPress':
              if (data.key) await page.keyboard.press(data.key as KeyInput);
              break;
            default:
              logger.warn(`Unhandled event type in touchpad mode: ${eventType}`);
              break;
          }
          sendResponse(ws, requestType, { success: true });
        } catch (simError: unknown) {
          logger.error(`Failed to handle event ${eventType} for session ${sessionId}:`, simError);
          sendResponse(ws, requestType, {
            success: false,
            error: (simError as Error).message,
          });
        }
    }
  } catch (error: unknown) {
    logger.error(`Failed to handle mouse event for session ${sessionId}:`, error);
    sendResponse(ws, requestType, {
      success: false,
      error: (error as Error).message,
    });
  }
}

export async function handleNavigate(
  ws: WebSocket,
  sessionId: string,
  page: Page,
  data: Record<string, unknown> | undefined,
  requestType: string
): Promise<void> {
  const { NAVIGATION_TIMEOUT, PAGE_LOAD_TIMEOUT } = await import('./events-types.js');
  try {
    if (data?.action) {
      switch (data.action) {
        case 'goBack':
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
          break;
        case 'goForward':
          await page.goForward({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
          break;
        case 'reload':
          await page.reload({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
          break;
      }
      logger.info(`Navigate action ${data.action} for session ${sessionId}`);
    } else {
      logger.info(`Navigating page for session ${sessionId} to ${data?.url}`);
      await page.goto(data?.url as string, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_LOAD_TIMEOUT,
      });
    }
    sendResponse(ws, requestType, { success: true });
  } catch (gotoError: unknown) {
    logger.error(`Failed navigate for ${sessionId}:`, gotoError);
    sendResponse(ws, requestType, {
      success: false,
      error: (gotoError as Error).message,
    });
  }
}

export async function handleGoBack(ws: WebSocket, page: Page, requestType: string): Promise<void> {
  const { NAVIGATION_TIMEOUT } = await import('./events-types.js');
  try {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    sendResponse(ws, requestType, { success: true });
  } catch (backError: unknown) {
    sendResponse(ws, requestType, { success: false, error: (backError as Error).message });
  }
}

export async function handleGoForward(ws: WebSocket, page: Page, requestType: string): Promise<void> {
  const { NAVIGATION_TIMEOUT } = await import('./events-types.js');
  try {
    await page.goForward({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    sendResponse(ws, requestType, { success: true });
  } catch (fwdError: unknown) {
    sendResponse(ws, requestType, { success: false, error: (fwdError as Error).message });
  }
}

export async function handleReload(ws: WebSocket, page: Page, requestType: string): Promise<void> {
  const { NAVIGATION_TIMEOUT } = await import('./events-types.js');
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    sendResponse(ws, requestType, { success: true });
  } catch (reloadError: unknown) {
    sendResponse(ws, requestType, { success: false, error: (reloadError as Error).message });
  }
}
