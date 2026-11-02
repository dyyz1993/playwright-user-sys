import { describe, it, expect, vi, beforeEach } from 'vitest';

// 指纹脚本生成器用固定标记，避免真实依赖
vi.mock('../../../machine/browser-utils.js', () => ({
  getFingerprintInjectableScript: vi.fn(() => 'MARKER_FP_SCRIPT'),
}));

vi.mock('@shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { setupBrowserLevelPreInjection } from '../../../machine/browser-target-handlers.js';
import { getFingerprintInjectableScript } from '../../../machine/browser-utils.js';

const FP = { fingerprint: { navigator: { platform: 'Win32' } } } as never;

function makeMocks(opts: { connection?: () => unknown } = {}) {
  const child = { send: vi.fn(async () => ({})) };
  const connection = opts.connection !== undefined ? opts.connection : () => ({ session: () => child });
  const browserCDP = {
    on: vi.fn(),
    send: vi.fn(async () => ({})),
    connection: vi.fn(() => connection()),
  };
  const browser = { target: () => ({ createCDPSession: vi.fn(async () => browserCDP) }) };
  return { browser, browserCDP, child, connection };
}

function attachedHandler(browserCDP: { on: ReturnType<typeof vi.fn> }): (event: unknown) => void {
  const call = browserCDP.on.mock.calls.find((c) => c[0] === 'Target.attachedToTarget');
  if (!call) throw new Error('attachedToTarget 监听器未注册');
  return call[1] as (event: unknown) => void;
}

describe('setupBrowserLevelPreInjection (#28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('监听器先于 setAutoAttach 注册，且 setAutoAttach 开启 waitForDebuggerOnStart', async () => {
    const { browser, browserCDP } = makeMocks();
    await setupBrowserLevelPreInjection(browser as never, FP, 's1');

    expect(browserCDP.on).toHaveBeenCalledWith('Target.attachedToTarget', expect.any(Function));
    const onIdx = browserCDP.on.mock.invocationCallOrder[0];
    const sendIdx = (browserCDP.send as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(onIdx).toBeLessThan(sendIdx);
    expect(browserCDP.send).toHaveBeenCalledWith('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
    });
  });

  it('page target attach 后按序注册：Page.enable → Runtime.enable → 注入脚本 → 放行', async () => {
    const { browser, browserCDP, child } = makeMocks();
    await setupBrowserLevelPreInjection(browser as never, FP, 's1');
    const handler = attachedHandler(browserCDP);

    handler({ sessionId: 'child-1', targetInfo: { type: 'page' } });
    await new Promise((r) => setTimeout(r, 50));

    await vi.waitFor(() => expect(child.send).toHaveBeenCalledTimes(4));

    const calls = child.send.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      'Page.enable',
      'Runtime.enable',
      'Page.addScriptToEvaluateOnNewDocument',
      'Runtime.runIfWaitingForDebugger',
    ]);
    expect(getFingerprintInjectableScript).toHaveBeenCalledWith(FP);
    expect(child.send.mock.calls[2][1]).toEqual({ source: 'MARKER_FP_SCRIPT' });
  });

  it('非 page target（iframe 等）不触发任何 child 会话调用', async () => {
    const { browser, browserCDP, child } = makeMocks();
    await setupBrowserLevelPreInjection(browser as never, FP, 's1');
    const handler = attachedHandler(browserCDP);

    handler({ sessionId: 'child-x', targetInfo: { type: 'iframe' } });
    expect(child.send).not.toHaveBeenCalled();
  });

  it('connection() 为 null 时不崩溃、不发送', async () => {
    const { browser, browserCDP, child } = makeMocks({ connection: () => null });
    await setupBrowserLevelPreInjection(browser as never, FP, 's1');
    const handler = attachedHandler(browserCDP);

    expect(() => handler({ sessionId: 'c1', targetInfo: { type: 'page' } })).not.toThrow();
    expect(child.send).not.toHaveBeenCalled();
  });

  it('createCDPSession 失败时抛出，由调用方降级', async () => {
    const browser = {
      target: () => ({
        createCDPSession: vi.fn(async () => {
          throw new Error('cdp unavailable');
        }),
      }),
    };
    await expect(setupBrowserLevelPreInjection(browser as never, FP, 's1')).rejects.toThrow('cdp unavailable');
  });
});
