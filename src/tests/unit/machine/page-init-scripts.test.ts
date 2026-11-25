import { describe, it, expect, vi } from 'vitest';

vi.mock('@shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { CLIPBOARD_INTERCEPTOR_SCRIPT } from '../../../machine/session_handlers/clipboard-constants.js';
import {
  applyPagePatchesToCurrentDocument,
  buildPageHelperScripts,
  focusBridgeName,
  registerPageHelperScriptsOnPage,
} from '../../../machine/page-init-scripts.js';

describe('page-init-scripts（新 Tab 页面辅助脚本的唯一来源）', () => {
  it('脚本数量与顺序固定，指纹不在其中（指纹由 fingerprint-injector 负责）', () => {
    const scripts = buildPageHelperScripts('sess-1.a');

    expect(scripts).toHaveLength(9);
    expect(scripts[2]).toBe(CLIPBOARD_INTERCEPTOR_SCRIPT);
    expect(scripts[0]).toContain('remote-cursor-pointer');
    expect(scripts[1]).toContain(focusBridgeName('sess-1.a'));
    expect(scripts[1]).toContain('focusin');
    expect(scripts[3]).toContain('console.debug');
    expect(scripts[4]).toContain('webdriver');
    expect(scripts[5]).toContain('deviceMemory');
    expect(scripts[6]).toContain('enumerateDevices');
    expect(scripts[7]).toContain('outerWidth');
    expect(scripts[8]).toContain('chrome.runtime');
    for (const source of scripts) {
      expect(source.trim().length).toBeGreaterThan(0);
    }
  });

  it('焦点桥函数名只保留合法标识符字符，与会话 ID 一一对应', () => {
    expect(focusBridgeName('0eef-b805_1')).toBe('_focusHandler_0eef_b805_1');
  });

  it('实例属性覆盖脚本可直接执行、可重复执行（同一文档跑两次不抛错）', () => {
    const scripts = buildPageHelperScripts('s');
    const runIn = (source: string, nav: Record<string, unknown>, win: Record<string, unknown>): void => {
      new Function('navigator', 'window', source)(nav, win);
    };

    const nav: Record<string, unknown> = {};
    const win: Record<string, unknown> = { innerWidth: 1280, innerHeight: 800 };
    runIn(scripts[4], nav, win);
    runIn(scripts[4], nav, win);
    runIn(scripts[5], nav, win);
    runIn(scripts[5], nav, win);
    runIn(scripts[7], nav, win);
    runIn(scripts[7], nav, win);

    expect(Object.getOwnPropertyDescriptor(nav, 'webdriver')?.get?.()).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(nav, 'deviceMemory')?.get?.()).toBe(8);
    expect(Object.getOwnPropertyDescriptor(win, 'outerWidth')?.get?.()).toBe(1280);
    expect(Object.getOwnPropertyDescriptor(win, 'outerHeight')?.get?.()).toBe(800);
  });

  it('降级路径经 Page 逐条注册，顺序与来源一致', async () => {
    const page = { evaluateOnNewDocument: vi.fn(async () => ({ identifier: 'id' })) };
    await registerPageHelperScriptsOnPage(page as never, 's');

    expect(page.evaluateOnNewDocument.mock.calls.map((c) => c[0])).toEqual(buildPageHelperScripts('s'));
  });

  it('当前文档兜底：四项补丁逐个立即求值，单项失败不影响其余', async () => {
    const logger = (await import('@shared/utils/logger.js')).logger;
    const page = {
      evaluate: vi.fn(async (source: unknown) => {
        if (source === CLIPBOARD_INTERCEPTOR_SCRIPT) throw new Error('navigation swapped the context');
        return undefined;
      }),
    };
    await applyPagePatchesToCurrentDocument(page as never, 's');

    expect(page.evaluate).toHaveBeenCalledTimes(4);
    expect(page.evaluate.mock.calls[0][0]).toBe(CLIPBOARD_INTERCEPTOR_SCRIPT);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('clipboard interceptor');
  });
});
