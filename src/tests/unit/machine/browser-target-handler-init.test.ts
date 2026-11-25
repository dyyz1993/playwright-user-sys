import { describe, it, expect, vi, beforeEach } from 'vitest';

// 指纹库只打桩两个入口：attach 内部仍会注册一次指纹脚本（与真实库一致），即时求值返回固定脚本
vi.mock('fingerprint-injector', () => ({
  FingerprintInjector: vi.fn().mockImplementation(() => ({
    attachFingerprintToPuppeteer: vi.fn(
      async (page: { evaluateOnNewDocument: (source: string) => Promise<unknown> }) => {
        await page.evaluateOnNewDocument('FP_FROM_ATTACH');
      }
    ),
    getInjectableScript: vi.fn(() => 'FP_IMMEDIATE'),
  })),
}));

vi.mock('@shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createTargetHandler } from '../../../machine/browser-target-handlers.js';
import { buildPageHelperScripts, focusBridgeName } from '../../../machine/page-init-scripts.js';
import { CLIPBOARD_INTERCEPTOR_SCRIPT } from '../../../machine/session_handlers/clipboard-constants.js';

const FP = { fingerprint: { navigator: { platform: 'Win32' } } } as never;

function makePage() {
  const permissionSend = vi.fn(async () => ({}));
  return {
    page: {
      on: vi.fn(),
      isClosed: vi.fn(() => false),
      url: vi.fn(() => 'about:blank'),
      evaluateOnNewDocument: vi.fn(async (_source: unknown) => ({ identifier: 'id' })),
      evaluate: vi.fn(async (_source: unknown) => undefined),
      exposeFunction: vi.fn(async (_name: string) => undefined),
      createCDPSession: vi.fn(async () => ({ send: permissionSend })),
    },
    permissionSend,
  };
}

function makeTarget(page: unknown, targetId = 'target-1') {
  return {
    type: () => 'page',
    url: () => 'about:blank',
    page: vi.fn(async () => page),
    _targetId: targetId,
  };
}

async function runHandler(
  target: unknown,
  injection?: { preInjected: boolean; registered: Set<string> },
  fingerprint = FP
) {
  await createTargetHandler('sess-1', fingerprint, injection)(target as never);
}

describe('createTargetHandler（页面辅助脚本的两条注册路径）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('目标附加时已注册：不再经 Page 逐条注册辅助脚本，也不重复暴露焦点桥', async () => {
    const { page, permissionSend } = makePage();
    const injection = { preInjected: true, registered: new Set(['target-1']) };

    await runHandler(makeTarget(page), injection);

    // 只剩指纹库 attach 自己的那一次注册；页面辅助脚本已在附加时经浏览器级会话注册
    expect(page.evaluateOnNewDocument.mock.calls.map((c) => c[0])).toEqual(['FP_FROM_ATTACH']);
    expect(page.exposeFunction).not.toHaveBeenCalled();
    // 初始 about:blank 文档在注册前已启动，当前文档兜底照常执行（脚本可重复执行）
    expect(page.evaluate.mock.calls.map((c) => c[0])).toEqual([
      'FP_IMMEDIATE',
      CLIPBOARD_INTERCEPTOR_SCRIPT,
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    ]);
    expect(permissionSend).toHaveBeenCalledWith(
      'Browser.grantPermissions',
      expect.objectContaining({ permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
    );
  });

  it('预注入未生效（降级）：经 Page 注册全部辅助脚本 + 焦点桥 + 当前文档兜底', async () => {
    const { page } = makePage();

    await runHandler(makeTarget(page), undefined);

    expect(page.evaluateOnNewDocument.mock.calls.map((c) => c[0])).toEqual([
      'FP_FROM_ATTACH',
      ...buildPageHelperScripts('sess-1'),
    ]);
    expect(page.exposeFunction).toHaveBeenCalledWith(focusBridgeName('sess-1'), expect.any(Function));
    expect(page.evaluate.mock.calls.map((c) => c[0])).toEqual([
      'FP_IMMEDIATE',
      CLIPBOARD_INTERCEPTOR_SCRIPT,
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  it('预注入生效但该目标漏注册：按降级路径补注册', async () => {
    const { page } = makePage();
    const injection = { preInjected: true, registered: new Set(['some-other-target']) };

    await runHandler(makeTarget(page), injection);

    expect(page.evaluateOnNewDocument).toHaveBeenCalledTimes(1 + buildPageHelperScripts('sess-1').length);
    expect(page.exposeFunction).toHaveBeenCalledTimes(1);
    expect(page.evaluate).toHaveBeenCalledTimes(5);
  });

  it('指纹关闭时跳过指纹注入，辅助脚本照常注册', async () => {
    const { page } = makePage();

    await runHandler(makeTarget(page), undefined, null);

    expect(page.evaluateOnNewDocument.mock.calls.map((c) => c[0])).toEqual(buildPageHelperScripts('sess-1'));
    expect(page.evaluate).toHaveBeenCalledTimes(4);
  });

  it('非 page 目标不处理', async () => {
    const { page } = makePage();
    const target = { type: () => 'service_worker', url: () => '', page: vi.fn(), _targetId: 'w-1' };

    await runHandler(target, undefined);

    expect(page.evaluateOnNewDocument).not.toHaveBeenCalled();
  });
});
