import { Target, CDPSession, Connection } from 'puppeteer-core';
import { FingerprintInjector } from 'fingerprint-injector';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import { logger } from '@shared/utils/logger.js';
import { CLIPBOARD_INTERCEPTOR_SCRIPT } from './session_handlers/clipboard-constants.js';
import { injectFocusinScript, injectMouseTrackingScript } from './session_handlers/page-inject.js';
import { getFingerprintInjectableScript } from './browser-utils.js';

export function handleTargetChangeHandler(_sessionId: string) {
  return async (target: Target) => {
    logger.info(`Target changed:  ${target.type()}`, target.url());
    if (target.type() === 'page') {
      const page = await target.page();
      if (!page || page.isClosed() || page.url().startsWith('devtools://')) return;
    }
  };
}

export function createTargetHandler(sessionId: string, fingerprint: BrowserFingerprintWithHeaders | null | undefined) {
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

      // 指纹注入必须最先做：browser.newPage() 立即返回，客户端可能马上 setContent/navigate，
      // 若 attach（内部仅注册 evaluateOnNewDocument）晚于导航提交，该文档整个裸奔真实环境
      // （TIER-101：首个新 tab 拿到 Linux/SwiftShader 裸值 vs 后续 tab 的伪装值）。
      // 前面原有多步 CDP 往返（鼠标/焦点/剪贴板权限）会把竞态窗口拉大到 100ms+。
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
        // 兜底：若导航已抢在注册前提交（init script 对当前文档无效），同一脚本即时求值——
        // 注入脚本按 defineProperty/函数包裹实现，重复执行幂等
        try {
          await page.evaluate(fingerprintInjector.getInjectableScript(fingerprint));
        } catch (lateEvalErr: unknown) {
          logger.debug(`指纹即时求值跳过（页面可能已跳转）: ${(lateEvalErr as Error).message}`);
        }
        logger.info(`成功注入指纹到新页面 (sessionId: ${sessionId}, url: ${page.url()})`);
      }

      await injectMouseTrackingScript(page);
      await injectFocusinScript(sessionId, page);

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

      await page.evaluateOnNewDocument(CLIPBOARD_INTERCEPTOR_SCRIPT);

      try {
        await page.evaluate(CLIPBOARD_INTERCEPTOR_SCRIPT);
      } catch (clipEvalErr: unknown) {
        logger.warn(`Failed to inject clipboard on current page for session ${sessionId}:`, clipEvalErr);
      }

      await page.evaluateOnNewDocument(() => {
        console.debug = () => {};
      });

      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });

      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => 8,
        });
      });

      await page.evaluateOnNewDocument(() => {
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
      });
      await page.evaluate(() => {
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
      });
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
        Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
      });
      await page.evaluate(() => {
        Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
        Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
      });
      await page.evaluateOnNewDocument(() => {
        if (window.chrome && !window.chrome.runtime) {
          window.chrome.runtime = {
            connect: function () {},
            sendMessage: function () {},
            onMessage: { addListener: function () {}, removeListener: function () {} },
            id: undefined,
          };
        }
      });
      await page.evaluate(() => {
        if (window.chrome && !window.chrome.runtime) {
          window.chrome.runtime = {
            connect: function () {},
            sendMessage: function () {},
            onMessage: { addListener: function () {}, removeListener: function () {} },
            id: undefined,
          };
        }
      });

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

/**
 * #28 框架级前置注入：在浏览器级 CDP 会话上开 autoattach + waitForDebuggerOnStart，
 * 借 attachedToTarget 时机（新 page target 仍处于 puppeteer 的暂停窗口）把指纹脚本
 * 抢先注册进 Page.addScriptToEvaluateOnNewDocument——客户端 goto 到达时脚本必然已注册，
 * 从根上消除 Tab1 首文档与注入注册的赛跑（详见 issue #28）。
 *
 * 注意：监听器必须先于 setAutoAttach 注册（否则首个 target 事件会漏掉）；
 * 本会话的 autoattach 也持有等待计数，注册完成后必须 Runtime.runIfWaitingForDebugger 放行。
 * 失败会抛出，调用方（browser-lifecycle）负责 try/catch 降级到 targetcreated 路径。
 */
export async function setupBrowserLevelPreInjection(
  // 入参用最小结构 + unknown 断言：调用方的 Browser 来自 puppeteer 包（内嵌另一份
  // puppeteer-core），与本文件引用的 puppeteer-core 的 CDPSession 是两个不同的类型
  browser: { target(): { createCDPSession(): Promise<unknown> } },
  fingerprint: BrowserFingerprintWithHeaders | null | undefined,
  sessionId: string
): Promise<void> {
  if (!fingerprint) return;
  const browserCDP = (await browser.target().createCDPSession()) as unknown as CDPSession;
  // 监听器必须先于 setAutoAttach 注册，否则首个 target 的 attachedToTarget 事件会漏掉
  browserCDP.on('Target.attachedToTarget', (event: { sessionId: string; targetInfo: { type: string } }) => {
    if (event.targetInfo.type !== 'page') return;
    try {
      const conn: Connection | null | undefined = browserCDP.connection();
      const child = conn?.session(event.sessionId);
      if (!child) {
        logger.warn(`browser-level pre-inject: child session 未就绪 (${sessionId})`);
        return;
      }
      child
        .send('Page.enable')
        .then(() => child.send('Runtime.enable'))
        .then(() =>
          // 指纹脚本在目标仍处于 waitForDebugger 暂停态时注册——先于一切页面 JS
          child.send('Page.addScriptToEvaluateOnNewDocument', {
            source: getFingerprintInjectableScript(fingerprint),
          })
        )
        .then(() =>
          // 本会话的 autoattach 也持有一个等待计数，注册完成后必须放行，
          // 否则目标被多会话的 waitForDebugger 永久卡死
          child.send('Runtime.runIfWaitingForDebugger').catch(() => {})
        )
        .catch((e: Error) => {
          logger.debug(`browser-level fingerprint pre-inject skipped (${sessionId}): ${(e as Error)?.message}`);
        });
    } catch (e) {
      logger.debug(`browser-level pre-inject child session error (${sessionId}): ${(e as Error)?.message}`);
    }
  });
  await browserCDP.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });
  logger.info(`Browser-level fingerprint pre-injection autoattach enabled (sessionId: ${sessionId})`);
}
