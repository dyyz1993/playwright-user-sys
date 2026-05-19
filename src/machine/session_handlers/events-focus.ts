import { WebSocket } from 'ws';
import { Page } from 'puppeteer-core';
import { logger } from '@shared/utils/logger.js';
import { sendNotification } from './events-helpers.js';

export async function handleRawFocusEvent(page: Page, ws: WebSocket, sessionId: string): Promise<void> {
  logger.info('handleRawFocusEvent', sessionId);
  if (page.isClosed() || ws.readyState !== WebSocket.OPEN) {
    logger.warn(`Page closed or WebSocket not open when handling raw focus for ${sessionId}.`);
    return;
  }
  logger.debug(`Handling raw focus event for ${sessionId}. Evaluating page...`);
  try {
    const focusedElementInfo = await page.evaluate(() => {
      let frameSelector: string | null = null;
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

        const iframeElement = activeElement as HTMLIFrameElement;
        if (!iframeElement.contentWindow) {
          return null;
        }
        activeElement = iframeElement.contentWindow.document.activeElement as HTMLElement;
      }
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)
      ) {
        const selector = activeElement.id
          ? `#${CSS.escape(activeElement.id)}`
          : activeElement.getAttribute('name')
            ? `[name="${CSS.escape(activeElement.getAttribute('name')!)}"]`
            : `${activeElement.tagName.toLowerCase()}:nth-child(${Array.from(activeElement.parentNode?.children || []).indexOf(activeElement) + 1})`;
        const tag = activeElement.tagName.toLowerCase();
        const value = activeElement.isContentEditable ? activeElement.innerText : (activeElement.value ?? '');
        const attributes: Record<string, string | boolean | null> = {};
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
          frameSelector: frameSelector,
          tag,
          value,
          ...attributes,
        };
      }
      return null;
    });

    if (focusedElementInfo && ws.readyState === WebSocket.OPEN) {
      logger.debug(`Sending form.field notification for ${sessionId}`);
      sendNotification(ws, 'form.field', focusedElementInfo);
    } else if (ws.readyState === WebSocket.OPEN) {
      logger.debug(`No suitable element focused when evaluating for ${sessionId}.`);
    }
  } catch (evalError: unknown) {
    if (!page.isClosed() && ws.readyState === WebSocket.OPEN) {
      logger.error(`Error evaluating focus state for session ${sessionId} after raw event:`, evalError);
    }
  }
}

const EVENT_NAME_MAP: Record<string, string> = {
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

const RAW_EVENT_NAME_MAP: Record<string, string> = {
  mousemove: 'mouseMove',
  mousedown: 'mouseDown',
  mouseup: 'mouseUp',
  click: 'mouseClick',
  wheel: 'mouseWheel',
  keydown: 'keyDown',
  keyup: 'keyUp',
};

export function mapEventType(innerType: string): string {
  return EVENT_NAME_MAP[innerType] || innerType;
}

export function mapRawEventType(eventType: string): string {
  return RAW_EVENT_NAME_MAP[eventType] || eventType;
}
