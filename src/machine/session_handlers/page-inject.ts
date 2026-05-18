import type { Page } from 'puppeteer-core';

import { logger } from '@shared/utils/logger.js';
import { sessionFocusEmitter } from '../utils.js';

export async function injectFocusinScript(sessionId: string, page: Page): Promise<void> {
  const dynamicFunctionName = `_focusHandler_${sessionId.replace(/\W/g, '_')}`;

  await page.evaluateOnNewDocument((fnName) => {
    document.addEventListener('focusin', function (_event) {
      if (typeof (window as unknown as Record<string, unknown>)[fnName] === 'function') {
        (window as unknown as Record<string, () => void>)[fnName]();
      }
    });
  }, dynamicFunctionName);
  logger.info(`Persistent focus listener script injected for session ${sessionId}.`);

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
    await page
      .evaluateOnNewDocument(() => {
        const existingCursor = document.getElementById('remote-cursor-pointer');
        if (existingCursor) {
          existingCursor.remove();
        }

        const cursor = document.createElement('div');
        cursor.id = 'remote-cursor-pointer';
        cursor.style.position = 'fixed';
        cursor.style.width = '10px';
        cursor.style.height = '10px';
        cursor.style.borderRadius = '50%';
        cursor.style.border = '2px solid rgba(0,120,255,0.8)';
        cursor.style.backgroundColor = 'rgba(0,120,255,0.3)';
        cursor.style.transform = 'translate(-50%, -50%)';
        cursor.style.zIndex = '9999999';
        cursor.style.pointerEvents = 'none';
        cursor.style.display = 'none';

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            document.body.appendChild(cursor);
          });
        } else {
          document.body.appendChild(cursor);
        }

        document.addEventListener('mousemove', function (e: MouseEvent) {
          const cssX = e.clientX;
          const cssY = e.clientY;

          cursor.style.left = `${cssX}px`;
          cursor.style.top = `${cssY}px`;
          cursor.style.display = 'block';
        });
      })
      .catch((error: unknown) => {
        logger.error('injectMouseTrackingScript error:', error);
      });
  } catch (error: unknown) {
    logger.error(`Failed to inject mouse tracking script for :`, error);
  }
}
