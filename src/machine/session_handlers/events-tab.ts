import { WebSocket } from 'ws';
import { Page } from 'puppeteer-core';
import { browserService } from '../browser.service.js';
import { logger } from '@shared/utils/logger.js';
import { safeSendWithCallback } from '../../utils/ws-backpressure.js';
import { sendResponse } from './events-helpers.js';

export async function handleTabAction(
  ws: WebSocket,
  sessionId: string,
  _page: Page,
  eventData: Record<string, unknown>,
  _requestType: string
): Promise<void> {
  const tabAction = eventData.action || (eventData.data as Record<string, unknown> | undefined)?.action;

  if (tabAction === 'list') {
    try {
      const browser = browserService.getSessionBrowser(sessionId);
      if (browser) {
        const pages = await browser.pages();
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
        safeSendWithCallback(ws, JSON.stringify({ type: 'tabList', tabs }), {}, (err) => {
          if (err) logger.error('Failed to send tabList:', err);
        });
      }
    } catch (tabError: unknown) {
      logger.error(`Failed to list tabs for session ${sessionId}:`, tabError);
    }
  } else if (tabAction === 'switch') {
    const targetUrl =
      (eventData.tabId as string) || ((eventData.data as Record<string, unknown> | undefined)?.tabId as string);
    try {
      const browser = browserService.getSessionBrowser(sessionId);
      if (browser) {
        const pages = await browser.pages();
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
    } catch (switchError: unknown) {
      logger.error(`Failed to switch tab for session ${sessionId}:`, switchError);
      sendResponse(ws, 'tab', { success: false, error: (switchError as Error).message });
    }
  } else if (tabAction === 'close') {
    const targetUrl =
      (eventData.tabId as string) || ((eventData.data as Record<string, unknown> | undefined)?.tabId as string);
    try {
      const browser = browserService.getSessionBrowser(sessionId);
      if (browser) {
        const pages = await browser.pages();
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
    } catch (closeTabError: unknown) {
      logger.error(`Failed to close tab for session ${sessionId}:`, closeTabError);
      sendResponse(ws, 'tab', { success: false, error: (closeTabError as Error).message });
    }
  }
}

export async function handlePaste(
  ws: WebSocket,
  sessionId: string,
  data: Record<string, unknown> | undefined,
  requestType: string
): Promise<void> {
  if (data && data.text) {
    try {
      const page = await browserService.getSessionPage(sessionId);
      if (page && !page.isClosed()) {
        await page.keyboard.type(String(data.text), { delay: 10 });
      }
    } catch (err: unknown) {
      logger.error('Paste failed:', err);
    }
  }
  sendResponse(ws, requestType, { success: true });
}
