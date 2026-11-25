import type { Page } from 'puppeteer-core';

import { logger } from '@shared/utils/logger.js';
import { sessionFocusEmitter } from '../utils.js';
import { focusBridgeName, focusinListenerScript, MOUSE_TRACKING_SCRIPT } from '../page-init-scripts.js';

export async function injectFocusinScript(sessionId: string, page: Page): Promise<void> {
  await page.evaluateOnNewDocument(focusinListenerScript(sessionId));
  logger.info(`Persistent focus listener script injected for session ${sessionId}.`);

  await exposeFocusBridge(sessionId, page);
}

/**
 * 在页面上暴露焦点桥：页面 focusin → window[bridgeName]() → Node 侧 sessionFocusEmitter。
 * 监听器脚本见 page-init-scripts.focusinListenerScript，两边的函数名由 focusBridgeName 统一。
 */
export async function exposeFocusBridge(sessionId: string, page: Page): Promise<void> {
  const dynamicFunctionName = focusBridgeName(sessionId);

  try {
    await page.exposeFunction(dynamicFunctionName, () => {
      logger.info(`Raw focus event triggered via bridge for session ${sessionId}`);
      sessionFocusEmitter.emit(`rawFocusEvent:${sessionId}`);
    });
    logger.info(`Dynamic focus bridge '${dynamicFunctionName}' exposed for session ${sessionId}.`);
  } catch (exposeError: unknown) {
    const msg = exposeError instanceof Error ? exposeError.message : String(exposeError);
    if (msg.includes('already exists')) {
      logger.warn(`Dynamic bridge function '${dynamicFunctionName}' likely already exposed for session ${sessionId}.`);
    } else {
      throw exposeError;
    }
  }
}

export async function injectMouseTrackingScript(page: Page): Promise<void> {
  try {
    await page.evaluateOnNewDocument(MOUSE_TRACKING_SCRIPT).catch((error: unknown) => {
      logger.error('injectMouseTrackingScript error:', error);
    });
  } catch (error: unknown) {
    logger.error(`Failed to inject mouse tracking script for :`, error);
  }
}
