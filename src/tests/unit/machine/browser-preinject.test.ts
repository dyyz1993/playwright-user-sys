import { describe, it, expect, vi, beforeEach } from 'vitest';

// 指纹脚本生成器用固定标记，避免真实依赖
vi.mock('../../../machine/browser-utils.js', () => ({
  getFingerprintInjectableScript: vi.fn(() => 'MARKER_FP_SCRIPT'),
}));

// 页面辅助脚本只保留两个标记：这里验证的是"注册顺序与时机"，脚本内容见 page-init-scripts.test.ts
vi.mock('../../../machine/page-init-scripts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../machine/page-init-scripts.js')>();
  return {
    ...actual,
    buildPageHelperScripts: vi.fn(() => ['HELPER_1', 'HELPER_2']),
  };
});

vi.mock('@shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { setupBrowserLevelPreInjection, attachPageInitHandlers } from '../../../machine/browser-target-handlers.js';
import { getFingerprintInjectableScript } from '../../../machine/browser-utils.js';
import { buildPageHelperScripts, focusBridgeName } from '../../../machine/page-init-scripts.js';
import { sessionFocusEmitter } from '../../../machine/utils.js';

const FP = { fingerprint: { navigator: { platform: 'Win32' } } } as never;

function makeMocks(opts: { connection?: () => unknown; existingTargets?: string[] } = {}) {
  const child = { send: vi.fn(async () => ({})), on: vi.fn() };
  const connection = opts.connection !== undefined ? opts.connection : () => ({ session: () => child });
  const browserCDP = {
    on: vi.fn(),
    send: vi.fn(async (method: string) =>
      method === 'Target.getTargets'
        ? { targetInfos: (opts.existingTargets ?? []).map((targetId) => ({ targetId })) }
        : {}
    ),
    connection: vi.fn(() => connection()),
  };
  const browser = {
    target: () => ({ createCDPSession: vi.fn(async () => browserCDP) }),
    on: vi.fn(),
  };
  return { browser, browserCDP, child, connection };
}

function attachedHandler(browserCDP: { on: ReturnType<typeof vi.fn> }): (event: unknown) => void {
  const call = browserCDP.on.mock.calls.find((c) => c[0] === 'Target.attachedToTarget');
  if (!call) throw new Error('attachedToTarget 监听器未注册');
  return call[1] as (event: unknown) => void;
}

function pageAttach(targetId: string, waitingForDebugger = true) {
  return { sessionId: `session-of-${targetId}`, targetInfo: { type: 'page', targetId }, waitingForDebugger };
}

async function settle() {
  await new Promise((r) => setTimeout(r, 20));
}

describe('setupBrowserLevelPreInjection（新 Tab 初始化脚本在"目标附加"时注册）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionFocusEmitter.removeAllListeners();
  });

  it('监听器先于 setAutoAttach 注册，且 setAutoAttach 开启 waitForDebuggerOnStart', async () => {
    const { browser, browserCDP } = makeMocks();
    await setupBrowserLevelPreInjection(browser as never, FP, 's1', { preInjected: false, registered: new Set() });

    expect(browserCDP.on).toHaveBeenCalledWith('Target.attachedToTarget', expect.any(Function));
    const onIdx = browserCDP.on.mock.invocationCallOrder[0];
    const autoAttachIdx = (browserCDP.send as ReturnType<typeof vi.fn>).mock.calls.findIndex(
      (c) => c[0] === 'Target.setAutoAttach'
    );
    const autoAttachOrder = (browserCDP.send as ReturnType<typeof vi.fn>).mock.invocationCallOrder[autoAttachIdx];
    expect(onIdx).toBeLessThan(autoAttachOrder);
    expect(browserCDP.send).toHaveBeenCalledWith('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
    });
  });

  it('新 page target：指纹 → 辅助脚本 → 焦点 binding 全部注册之后才放行', async () => {
    const { browser, browserCDP, child } = makeMocks();
    const injection = { preInjected: false, registered: new Set<string>() };
    await setupBrowserLevelPreInjection(browser as never, FP, 's1', injection);
    const handler = attachedHandler(browserCDP);

    handler(pageAttach('target-new'));
    await vi.waitFor(() => expect(child.send).toHaveBeenCalledTimes(7));

    // 同一连接保序：放行（runIfWaitingForDebugger）必须是最后一条，否则首个文档可能抢在注册前启动
    expect(child.send.mock.calls.map((c) => c[0])).toEqual([
      'Page.enable',
      'Runtime.enable',
      'Page.addScriptToEvaluateOnNewDocument',
      'Page.addScriptToEvaluateOnNewDocument',
      'Page.addScriptToEvaluateOnNewDocument',
      'Runtime.addBinding',
      'Runtime.runIfWaitingForDebugger',
    ]);
    expect(getFingerprintInjectableScript).toHaveBeenCalledWith(FP);
    expect(child.send.mock.calls.slice(2, 5).map((c) => c[1])).toEqual([
      { source: 'MARKER_FP_SCRIPT' },
      { source: 'HELPER_1' },
      { source: 'HELPER_2' },
    ]);
    expect(buildPageHelperScripts).toHaveBeenCalledWith('s1');
    expect(child.send.mock.calls[5][1]).toEqual({ name: focusBridgeName('s1') });
    expect(injection.preInjected).toBe(true);
    expect(injection.registered.has('target-new')).toBe(true);
  });

  it('焦点桥：页面调用 binding 时转发为 rawFocusEvent:<sessionId>', async () => {
    const { browser, browserCDP, child } = makeMocks();
    await setupBrowserLevelPreInjection(browser as never, FP, 's1', { preInjected: false, registered: new Set() });
    attachedHandler(browserCDP)(pageAttach('target-new'));
    await settle();

    const onBinding = child.on.mock.calls.find((c) => c[0] === 'Runtime.bindingCalled');
    if (!onBinding) throw new Error('Runtime.bindingCalled 监听器未注册');
    const onRawFocus = vi.fn();
    sessionFocusEmitter.on('rawFocusEvent:s1', onRawFocus);

    (onBinding[1] as (event: { name: string }) => void)({ name: focusBridgeName('s1') });
    (onBinding[1] as (event: { name: string }) => void)({ name: 'someOtherBinding' });

    expect(onRawFocus).toHaveBeenCalledTimes(1);
  });

  it('已存在的目标（primaryPage 等）只补指纹脚本，不重复注册辅助脚本', async () => {
    const { browser, browserCDP, child } = makeMocks({ existingTargets: ['target-primary'] });
    const injection = { preInjected: false, registered: new Set<string>() };
    await setupBrowserLevelPreInjection(browser as never, FP, 's1', injection);

    attachedHandler(browserCDP)(pageAttach('target-primary', false));
    await settle();

    expect(child.send.mock.calls.map((c) => c[0])).toEqual([
      'Page.enable',
      'Runtime.enable',
      'Page.addScriptToEvaluateOnNewDocument',
      'Runtime.runIfWaitingForDebugger',
    ]);
    expect(child.send.mock.calls[2][1]).toEqual({ source: 'MARKER_FP_SCRIPT' });
    // 辅助脚本每个浏览器只生成一次（与目标无关），这里断言的是"没有下发"
    expect(child.send.mock.calls.some((c) => JSON.stringify(c[1] ?? {}).includes('HELPER_'))).toBe(false);
    expect(injection.registered.has('target-primary')).toBe(false);
  });

  it('新目标未被暂停（附加前已被放行）时不在附加路径注册辅助脚本，留给 targetcreated 路径', async () => {
    const { browser, browserCDP, child } = makeMocks();
    const injection = { preInjected: false, registered: new Set<string>() };
    await setupBrowserLevelPreInjection(browser as never, FP, 's1', injection);

    attachedHandler(browserCDP)(pageAttach('target-resumed', false));
    await settle();

    expect(child.send.mock.calls.map((c) => c[0])).toEqual([
      'Page.enable',
      'Runtime.enable',
      'Page.addScriptToEvaluateOnNewDocument',
      'Runtime.runIfWaitingForDebugger',
    ]);
    expect(injection.registered.has('target-resumed')).toBe(false);
  });

  it('指纹关闭（null）时仍注册页面辅助脚本与焦点桥', async () => {
    const { browser, browserCDP, child } = makeMocks();
    const injection = { preInjected: false, registered: new Set<string>() };
    await setupBrowserLevelPreInjection(browser as never, null, 's1', injection);

    attachedHandler(browserCDP)(pageAttach('target-new'));
    await vi.waitFor(() => expect(child.send).toHaveBeenCalledTimes(6));

    expect(child.send.mock.calls.map((c) => c[0])).toEqual([
      'Page.enable',
      'Runtime.enable',
      'Page.addScriptToEvaluateOnNewDocument',
      'Page.addScriptToEvaluateOnNewDocument',
      'Runtime.addBinding',
      'Runtime.runIfWaitingForDebugger',
    ]);
    expect(child.send.mock.calls.slice(2, 4).map((c) => c[1])).toEqual([
      { source: 'HELPER_1' },
      { source: 'HELPER_2' },
    ]);
    expect(getFingerprintInjectableScript).not.toHaveBeenCalled();
    expect(injection.registered.has('target-new')).toBe(true);
  });

  it('非 page target（iframe 等）不触发任何 child 会话调用', async () => {
    const { browser, browserCDP, child } = makeMocks();
    await setupBrowserLevelPreInjection(browser as never, FP, 's1', { preInjected: false, registered: new Set() });
    const handler = attachedHandler(browserCDP);

    handler({ sessionId: 'child-x', targetInfo: { type: 'iframe' } });
    expect(child.send).not.toHaveBeenCalled();
  });

  it('connection() 为 null 时不崩溃、不发送、不计入已注册', async () => {
    const { browser, browserCDP, child } = makeMocks({ connection: () => null });
    const injection = { preInjected: false, registered: new Set<string>() };
    await setupBrowserLevelPreInjection(browser as never, FP, 's1', injection);
    const handler = attachedHandler(browserCDP);

    expect(() => handler(pageAttach('c1'))).not.toThrow();
    expect(child.send).not.toHaveBeenCalled();
    expect(injection.registered.has('c1')).toBe(false);
  });

  it('createCDPSession 失败时抛出，由调用方降级', async () => {
    const browser = {
      target: () => ({
        createCDPSession: vi.fn(async () => {
          throw new Error('cdp unavailable');
        }),
      }),
    };
    await expect(
      setupBrowserLevelPreInjection(browser as never, FP, 's1', { preInjected: false, registered: new Set() })
    ).rejects.toThrow('cdp unavailable');
  });
});

describe('attachPageInitHandlers（两条注册路径的接线）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('先挂 targetcreated 处理器再开启预注入，成功后标记 preInjected', async () => {
    const { browser, browserCDP } = makeMocks();

    const injection = await attachPageInitHandlers(browser as never, 's1', FP);

    expect(browser.on).toHaveBeenCalledTimes(1);
    expect(browser.on.mock.calls[0][0]).toBe('targetcreated');
    // targetcreated 处理器先于 setAutoAttach 挂上，预注入生效前创建的页面不会漏掉降级注册
    const handlerIdx = browser.on.mock.invocationCallOrder[0];
    const setupIdx = browserCDP.send.mock.invocationCallOrder[0];
    expect(handlerIdx).toBeLessThan(setupIdx);
    expect(injection.preInjected).toBe(true);
  });

  it('预注入失败时不抛出：保持降级路径（preInjected=false）并告警', async () => {
    const browser = {
      target: () => ({
        createCDPSession: vi.fn(async () => {
          throw new Error('cdp unavailable');
        }),
      }),
      on: vi.fn(),
    };
    const logger = (await import('@shared/utils/logger.js')).logger;

    const injection = await attachPageInitHandlers(browser as never, 's1', FP);

    expect(injection.preInjected).toBe(false);
    expect(browser.on).toHaveBeenCalledWith('targetcreated', expect.any(Function));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('non-fatal'),
      expect.objectContaining({ message: 'cdp unavailable' })
    );
  });
});
