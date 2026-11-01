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

type FocusedEditableState = { editable: boolean; tag: string; content: string };

async function readFocusedEditable(page: Page): Promise<FocusedEditableState | null> {
  try {
    return await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return { editable: false, tag: '', content: '' };
      const tag = el.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
      let content = '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        content = (el as unknown as HTMLInputElement).value ?? '';
      } else if (el.isContentEditable) {
        content = el.textContent ?? '';
      }
      return { editable, tag, content };
    });
  } catch {
    return null;
  }
}

export async function handlePaste(
  ws: WebSocket,
  sessionId: string,
  data: Record<string, unknown> | undefined,
  requestType: string
): Promise<void> {
  // 兼容两种格式：{type:'paste',data:{text}}（标准）与 {type:'paste',text}（旧客户端顶层字段，
  // 分发器在 data 缺失时回退传整个 eventData）
  const text = typeof data?.text === 'string' ? data.text : undefined;
  if (!text) {
    sendResponse(ws, requestType, {
      success: false,
      error: 'paste 缺少 text 字段（期望 {type:"paste",data:{text:"..."}}）',
    });
    return;
  }
  try {
    const page = await browserService.getSessionPage(sessionId);
    if (!page || page.isClosed()) {
      sendResponse(ws, requestType, { success: false, error: '会话页面不存在或已关闭' });
      return;
    }

    // 假成功防线 1：没有聚焦的可输入元素时，keyboard/insertText 会静默落空——先检查再插入
    const before = await readFocusedEditable(page);
    if (!before) {
      sendResponse(ws, requestType, { success: false, error: '无法读取远端页面焦点状态' });
      return;
    }
    if (!before.editable) {
      sendResponse(ws, requestType, {
        success: false,
        error: `当前焦点元素 ${before.tag || '(none)'} 不可输入，请先点击远端页面的输入框再粘贴`,
      });
      return;
    }

    // Input.insertText 等价于真实粘贴/IME 上屏：原子插入、中文/长文本可靠，
    // 且会触发 input 事件（React 受控组件可感知）；keyboard.type 逐字符派发在
    // 无键盘布局字符（CJK）上不可靠且慢
    const client = await page.createCDPSession();
    try {
      await client.send('Input.insertText', { text });
    } finally {
      void client.detach().catch(() => {});
    }

    // 假成功防线 2：回读焦点元素内容，确认文本真的进了页面（替换选区场景下
    // 长度可能不增反减，所以用"内容发生变化"判定而不是长度递增）
    const after = await readFocusedEditable(page);
    if (!after) {
      sendResponse(ws, requestType, { success: false, error: '无法回读插入结果，粘贴是否生效未知' });
      return;
    }
    if (after.content === before.content) {
      sendResponse(ws, requestType, {
        success: false,
        error: '远端页面未接收文本（焦点元素内容未变化；页面可能拦截了粘贴或字段只读）',
      });
      return;
    }
    sendResponse(ws, requestType, {
      success: true,
      tag: after.tag,
      lengthBefore: before.content.length,
      lengthAfter: after.content.length,
    });
  } catch (err: unknown) {
    logger.error('Paste failed:', err);
    sendResponse(ws, requestType, { success: false, error: err instanceof Error ? err.message : String(err) });
  }
}
