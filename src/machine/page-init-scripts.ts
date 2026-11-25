import type { Page } from 'puppeteer-core';
import { logger } from '@shared/utils/logger.js';
import { CLIPBOARD_INTERCEPTOR_SCRIPT } from './session_handlers/clipboard-constants.js';

/**
 * 新 Tab 的页面辅助脚本（非指纹部分）的唯一来源，统一产出为字符串。
 *
 * 同一组脚本有两条注册路径：
 * 1. 正常路径：目标附加（Target.attachedToTarget）时经 CDP 子会话注册，早于任何客户端导航；
 * 2. 降级路径：预注入不可用时，由 targetcreated 处理器经 puppeteer Page 注册。
 * 两条路径必须拿到完全相同的脚本，所以这里不写两份，而是集中生成字符串。
 *
 * 注意：初始化脚本只对"注册之后创建的文档"生效。一旦客户端导航已经开始才注册，
 * 该文档就拿不到脚本（跨进程导航会换渲染进程）——这正是 TIER-101 首个 Tab 指纹不一致的原因。
 */

/** 焦点桥函数名：页面 focusin 监听器与 Node 侧 binding 必须使用同一个名字 */
export function focusBridgeName(sessionId: string): string {
  return `_focusHandler_${sessionId.replace(/\W/g, '_')}`;
}

function scriptOf(fn: () => void): string {
  return `(${fn.toString()})()`;
}

function scriptOfWithArg(fn: (_arg: string) => void, arg: string): string {
  return `(${fn.toString()})(${JSON.stringify(arg)})`;
}

function mouseTracking(): void {
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

  document.addEventListener('mousemove', (e: MouseEvent) => {
    const cssX = e.clientX;
    const cssY = e.clientY;

    cursor.style.left = `${cssX}px`;
    cursor.style.top = `${cssY}px`;
    cursor.style.display = 'block';
  });
}

function focusinListener(fnName: string): void {
  document.addEventListener('focusin', function () {
    const bridge = (window as unknown as Record<string, unknown>)[fnName];
    if (typeof bridge === 'function') {
      // 焦点桥是一条 CDP binding：必须带恰好一个字符串参数，无参调用会抛
      // "Invalid arguments: should be exactly one string"
      (bridge as (_payload: string) => void)('focusin');
    }
  });
}

function disableConsoleDebug(): void {
  console.debug = () => {};
}

function hideWebdriver(): void {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
  });
}

function capDeviceMemory(): void {
  Object.defineProperty(navigator, 'deviceMemory', {
    get: () => 8,
    configurable: true,
  });
}

function mediaDevicesFallback(): void {
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    const origEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    const fakeDevices = [
      { kind: 'audioinput', deviceId: 'default', groupId: 'default', label: '' },
      { kind: 'audioinput', deviceId: 'communications', groupId: 'default', label: '' },
      { kind: 'audiooutput', deviceId: 'default', groupId: 'default', label: '' },
      { kind: 'audiooutput', deviceId: 'communications', groupId: 'default', label: '' },
    ];
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      value: async () => {
        try {
          const real = await origEnumerate();
          if (real && real.length > 0) return real;
        } catch (e) {
          void e;
        }
        return fakeDevices;
      },
      configurable: true,
    });
  }
}

function outerDimensionsFollowViewport(): void {
  Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth, configurable: true });
  Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight, configurable: true });
}

function chromeRuntimeStub(): void {
  if (window.chrome && !window.chrome.runtime) {
    window.chrome.runtime = {
      connect: function () {},
      sendMessage: function () {},
      onMessage: { addListener: function () {}, removeListener: function () {} },
      id: undefined,
    };
  }
}

/** 焦点桥监听器脚本（focusin → window[bridgeName]('focusin')），供 page-inject 的 primaryPage 路径复用 */
export function focusinListenerScript(sessionId: string): string {
  return scriptOfWithArg(focusinListener, focusBridgeName(sessionId));
}

/** 鼠标跟踪（远端光标）脚本，供 page-inject 的 primaryPage 路径复用 */
export const MOUSE_TRACKING_SCRIPT = scriptOf(mouseTracking);

/**
 * 新 Tab 需要的页面辅助脚本，顺序即注册顺序：
 * 鼠标跟踪、焦点桥监听、剪贴板/文件选择拦截、console.debug 静音、
 * webdriver 隐藏、deviceMemory 上限、媒体设备兜底、outer 尺寸跟随视口、chrome.runtime 补齐。
 */
export function buildPageHelperScripts(sessionId: string): string[] {
  return [
    MOUSE_TRACKING_SCRIPT,
    focusinListenerScript(sessionId),
    CLIPBOARD_INTERCEPTOR_SCRIPT,
    scriptOf(disableConsoleDebug),
    scriptOf(hideWebdriver),
    scriptOf(capDeviceMemory),
    scriptOf(mediaDevicesFallback),
    scriptOf(outerDimensionsFollowViewport),
    scriptOf(chromeRuntimeStub),
  ];
}

/** 降级路径：经 puppeteer Page 逐条注册页面辅助脚本（不含指纹） */
export async function registerPageHelperScriptsOnPage(page: Page, sessionId: string): Promise<void> {
  for (const source of buildPageHelperScripts(sessionId)) {
    await page.evaluateOnNewDocument(source);
  }
}

/**
 * 给"当前文档"立即补上对应补丁。
 * 初始化脚本只对之后创建的文档生效；降级路径下注册晚于当前文档启动，当前文档需要立即求值一次。
 */
export async function applyPagePatchesToCurrentDocument(page: Page, sessionId: string): Promise<void> {
  const patches: Array<[string, () => Promise<unknown>]> = [
    ['clipboard interceptor', () => page.evaluate(CLIPBOARD_INTERCEPTOR_SCRIPT)],
    ['mediaDevices fallback', () => page.evaluate(mediaDevicesFallback)],
    ['outer dimensions', () => page.evaluate(outerDimensionsFollowViewport)],
    ['chrome.runtime stub', () => page.evaluate(chromeRuntimeStub)],
  ];
  for (const [name, apply] of patches) {
    try {
      await apply();
    } catch (patchError: unknown) {
      logger.warn(`Failed to apply ${name} on current page for session ${sessionId}:`, patchError);
    }
  }
}
