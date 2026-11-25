import { Target, CDPSession, Connection } from 'puppeteer-core';
import { FingerprintInjector } from 'fingerprint-injector';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import { logger } from '@shared/utils/logger.js';
import { getFingerprintInjectableScript } from './browser-utils.js';
import {
  applyPagePatchesToCurrentDocument,
  buildPageHelperScripts,
  focusBridgeName,
  registerPageHelperScriptsOnPage,
} from './page-init-scripts.js';
import { exposeFocusBridge } from './session_handlers/page-inject.js';
import { sessionFocusEmitter } from './utils.js';

export function handleTargetChangeHandler(_sessionId: string) {
  return async (target: Target) => {
    logger.info(`Target changed:  ${target.type()}`, target.url());
    if (target.type() === 'page') {
      const page = await target.page();
      if (!page || page.isClosed() || page.url().startsWith('devtools://')) return;
    }
  };
}

/**
 * 页面初始化脚本的预注入状态：targetcreated 与 attachedToTarget 两条路径共享。
 */
export interface PageInitInjection {
  /** 预注入是否生效：生效后，新 page target 的初始化脚本在"目标附加"时注册 */
  preInjected: boolean;
  /** 已在目标附加时完成初始化脚本注册的 page target */
  readonly registered: Set<string>;
}

/**
 * 该目标的页面辅助脚本是否已在"目标附加"时注册完。
 * puppeteer 的 Target 以受保护的 `_targetId` 暴露 targetId；取不到时按"未注册"处理（走降级路径，
 * 最坏只是重复注册，不会漏注册）。
 */
function helperScriptsPreInjected(injection: PageInitInjection | undefined, target: Target): boolean {
  if (!injection?.preInjected) return false;
  const targetId = (target as unknown as { _targetId?: string })._targetId;
  return typeof targetId === 'string' && injection.registered.has(targetId);
}

/**
 * @param injection 页面初始化脚本的预注入状态。缺省或未生效时，页面辅助脚本在这里逐条注册（降级路径）。
 */
export function createTargetHandler(
  sessionId: string,
  fingerprint: BrowserFingerprintWithHeaders | null | undefined,
  injection?: PageInitInjection
) {
  return async (target: Target) => {
    logger.info(`Target created:  ${target.type()}`, target.url());
    try {
      if (target.type() !== 'page') return;
      const page = await target.page();
      if (!page) return;

      page.on('dialog', async (dialog) => {
        await dialog.dismiss();
      });

      if (page.isClosed() || page.url().startsWith('devtools://') || page.url().startsWith('file://')) return;
      logger.debug(`新页面目标创建，准备注入指纹 (sessionId: ${sessionId}, url: ${page.url()})`);

      // 页面级指纹仿真（UA / 设备指标 / 请求头 / 媒体特性）与当前文档兜底，放在最前面做。
      // 指纹脚本本身已在"目标附加"时由浏览器级会话注册（setupBrowserLevelPreInjection），
      // 不依赖这里；这里晚于客户端导航时，最多只影响首个文档请求头层面的仿真。
      if (fingerprint) {
        const fingerprintInjector = new FingerprintInjector();
        await fingerprintInjector.attachFingerprintToPuppeteer(
          page as unknown as Parameters<typeof fingerprintInjector.attachFingerprintToPuppeteer>[0],
          fingerprint
        );
        // 注意：不要在此再叠加 Page.setDeviceMetricsOverride / viewport 覆写。
        // attachFingerprintToPuppeteer 内部已用 fingerprint.screen 统一设置；
        // 再覆写会把 screen 拉平为 viewport 尺寸，导致新 Tab 与 primaryPage 的
        // screen 指纹分叉（PR #27 排查结论）。
        // 当前文档兜底：初始化脚本只对之后的文档生效，about:blank 这个初始文档在注册前就已启动，
        // 同一脚本即时求值补上（注入脚本按原型 getter 包裹实现，重复执行幂等）
        try {
          await page.evaluate(fingerprintInjector.getInjectableScript(fingerprint));
        } catch (lateEvalErr: unknown) {
          logger.debug(`指纹即时求值跳过（页面可能已跳转）: ${(lateEvalErr as Error).message}`);
        }
        logger.info(`成功注入指纹到新页面 (sessionId: ${sessionId}, url: ${page.url()})`);
      }

      // 页面辅助脚本（鼠标跟踪 / 焦点桥 / 剪贴板与文件选择拦截 / 反检测覆盖）：
      // 正常情况下已在"目标附加"时注册完毕（setupBrowserLevelPreInjection），早于任何客户端导航。
      // 只有预注入不可用、或该目标在附加时漏注册，才在这里逐条补上——这条路要走多次 CDP 往返，
      // 客户端 newPage() 后立刻导航时当前文档会拿不到脚本，所以只作为降级。
      if (!helperScriptsPreInjected(injection, target)) {
        await registerPageHelperScriptsOnPage(page, sessionId);
        await exposeFocusBridge(sessionId, page);
      }
      // 初始化脚本只对之后创建的文档生效：about:blank 这个初始文档在注册前就已启动
      // （附加时的暂停挡不住它），所以当前文档需要立即补一次；脚本可重复执行，两条路径都安全
      await applyPagePatchesToCurrentDocument(page, sessionId);

      try {
        const cdp = await page.createCDPSession();
        await cdp.send('Browser.grantPermissions', {
          origin: page.url() || 'http://192.168.0.29:3011/public/test-interactive.html',
          permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
        });
        logger.info(`Clipboard permissions granted for session ${sessionId}`);
      } catch (permErr: unknown) {
        logger.warn(`Failed to grant clipboard permissions for session ${sessionId}:`, permErr);
      }

      // 指纹注入已提前到 handler 首位（见上），此处不再处理
    } catch (error: unknown) {
      logger.error(`处理新页面目标失败 (sessionId: ${sessionId}):`, error);
    }
  };
}

export function createDisconnectHandler(sessionId: string, proxy: string, onClose: () => void) {
  return () => {
    logger.warn(`浏览器实例已断开连接，将关闭会话 (sessionId: ${sessionId})`);
    if (proxy) {
      import('proxy-chain')
        .then((ProxyChain) => ProxyChain.closeAnonymizedProxy(proxy, true))
        .catch((error: unknown) => logger.error(`关闭断开连接的浏览器时出错 (sessionId: ${sessionId}):`, error));
    }
    onClose();
  };
}

interface PageInitBrowser {
  target(): { createCDPSession(): Promise<unknown> };
  on(_event: 'targetcreated', _handler: (_target: Target) => void): unknown;
}

/**
 * 给一个浏览器实例接上"新 Tab 初始化"的两条路径：
 * 1. 目标附加时注册（setupBrowserLevelPreInjection，主路径）；
 * 2. targetcreated 处理器（createTargetHandler）：负责页面级仿真与权限，并在主路径不可用时补注册脚本。
 */
export async function attachPageInitHandlers(
  browser: PageInitBrowser,
  sessionId: string,
  fingerprint: BrowserFingerprintWithHeaders | null | undefined
): Promise<PageInitInjection> {
  const injection: PageInitInjection = { preInjected: false, registered: new Set<string>() };
  browser.on('targetcreated', createTargetHandler(sessionId, fingerprint, injection));
  try {
    await setupBrowserLevelPreInjection(browser, fingerprint, sessionId, injection);
  } catch (preinjectError: unknown) {
    logger.warn(
      `Browser-level pre-injection setup failed (non-fatal, falls back to targetcreated path) (sessionId: ${sessionId}):`,
      preinjectError
    );
  }
  return injection;
}

/**
 * #28 框架级前置注入：在浏览器级 CDP 会话上开 autoattach + waitForDebuggerOnStart，
 * 借 attachedToTarget 时机（新 page target 尚未开始执行）把新 Tab 需要的全部初始化脚本
 * （指纹 + 页面辅助脚本）注册完，最后才 Runtime.runIfWaitingForDebugger 放行。
 *
 * 为什么必须在这里注册：初始化脚本只对"注册之后创建的文档"生效。客户端 newPage() 一返回就可能导航，
 * 而 targetcreated 处理器要走多次 CDP 往返才注册得完，首个文档会漏掉后注册的那批脚本
 * （TIER-101：首个 Tab 的 deviceMemory 等字段与其它 Tab 不一致）。浏览器级会话在 target 创建的
 * 同一时刻就收到事件，注册必然早于任何客户端对该 target 的操作。
 *
 * 注意：
 * - 监听器必须先于 setAutoAttach 注册（否则首个 target 事件会漏掉）；
 * - 只给"此后新建"的 page target 注册页面辅助脚本：已存在的目标（primaryPage 等）在启动流程里
 *   各自注册过，重复注册会让同一份脚本在一个文档里执行两次；
 * - 命令立即连发不等 ack：同一 ws 连接保序送达，"注册→放行"之间不会被插入其它消息；
 * - 失败会抛出，调用方（attachPageInitHandlers）降级到 targetcreated 路径。
 */
export async function setupBrowserLevelPreInjection(
  // 入参用最小结构 + unknown 断言：调用方的 Browser 来自 puppeteer 包（内嵌另一份
  // puppeteer-core），与本文件引用的 puppeteer-core 的 CDPSession 是两个不同的类型
  browser: { target(): { createCDPSession(): Promise<unknown> } },
  fingerprint: BrowserFingerprintWithHeaders | null | undefined,
  sessionId: string,
  injection: PageInitInjection
): Promise<void> {
  const browserCDP = (await browser.target().createCDPSession()) as unknown as CDPSession;
  const { targetInfos } = await browserCDP.send('Target.getTargets');
  const existingTargets = new Set(targetInfos.map((info) => info.targetId));
  const focusBindingName = focusBridgeName(sessionId);
  const helperScripts = buildPageHelperScripts(sessionId);

  // 监听器必须先于 setAutoAttach 注册，否则首个 target 的 attachedToTarget 事件会漏掉
  browserCDP.on('Target.attachedToTarget', (event) => {
    if (event.targetInfo.type !== 'page') return;
    const targetId = event.targetInfo.targetId;
    try {
      const conn: Connection | null | undefined = browserCDP.connection();
      const child = conn?.session(event.sessionId);
      if (!child) {
        logger.warn(`browser-level pre-inject: child session 未就绪，交由 targetcreated 路径补注册 (${sessionId})`);
        return;
      }
      const skipped = (step: string) => (e: Error) => {
        logger.debug(`pre-inject ${step} skipped (${sessionId}): ${(e as Error)?.message}`);
      };
      // 四类命令立即连发不等待 ack：同一 ws 连接保序送达，把"注册→放行"
      // 与 puppeteer 自身 resume 之间的竞态窗口压到近零（串行 await 每跳一次事件
      // 循环，慢速 runner 下会被 puppeteer 的放行抢先，CI 已实测仍有残留）
      void child.send('Page.enable').catch(skipped('Page.enable'));
      void child.send('Runtime.enable').catch(skipped('Runtime.enable'));
      if (fingerprint) {
        void child
          .send('Page.addScriptToEvaluateOnNewDocument', {
            source: getFingerprintInjectableScript(fingerprint),
          })
          .catch(skipped('fingerprint script'));
      }
      const isNewTarget = !existingTargets.has(targetId);
      if (isNewTarget && event.waitingForDebugger) {
        for (const source of helperScripts) {
          void child.send('Page.addScriptToEvaluateOnNewDocument', { source }).catch(skipped('helper script'));
        }
        // 焦点桥：binding 挂在同一条子会话上，页面 focusin → window[bridge]() → 这里的 bindingCalled
        child.on('Runtime.bindingCalled', (bindingEvent) => {
          if (bindingEvent.name === focusBindingName) {
            sessionFocusEmitter.emit(`rawFocusEvent:${sessionId}`);
          }
        });
        void child.send('Runtime.addBinding', { name: focusBindingName }).catch(skipped('focus binding'));
        injection.registered.add(targetId);
        logger.info(`新页面初始化脚本已在目标附加时注册 (sessionId: ${sessionId}, targetId: ${targetId.slice(0, 8)})`);
      } else if (isNewTarget) {
        // 目标在附加前已被其它会话放行，初始文档可能已经启动：交给 targetcreated 路径补注册
        logger.warn(`browser-level pre-inject: 目标未被暂停，页面辅助脚本改由 targetcreated 路径注册 (${sessionId})`);
      }
      void child.send('Runtime.runIfWaitingForDebugger').catch(skipped('resume'));
    } catch (e) {
      injection.registered.delete(targetId);
      logger.debug(`browser-level pre-inject child session error (${sessionId}): ${(e as Error)?.message}`);
    }
  });
  await browserCDP.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });
  injection.preInjected = true;
  logger.info(`Browser-level page init pre-injection autoattach enabled (sessionId: ${sessionId})`);
}
