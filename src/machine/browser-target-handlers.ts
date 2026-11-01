import { Target } from 'puppeteer-core';
import { FingerprintInjector } from 'fingerprint-injector';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import { logger } from '@shared/utils/logger.js';
import { CLIPBOARD_INTERCEPTOR_SCRIPT } from './session_handlers/clipboard-constants.js';
import { injectFocusinScript, injectMouseTrackingScript } from './session_handlers/page-inject.js';

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

      // 竞态修复：注入完成前 hold 住导航（Fetch 拦截暂停一切请求）。
      // 背景：puppeteer 的 newPage() 在 targetcreated 后即 resolve，测试随即 goto；
      // 若本 handler 的 evaluateOnNewDocument 尚未注册，首个导航会裸奔（TIER-101 Tab1 现象）。
      // 拦截期间请求挂起，注入完成后 resume，导航继续且带上指纹脚本。
      let fetchCdp: import('puppeteer-core').CDPSession | null = null;
      try {
        fetchCdp = await page.createCDPSession();
        await fetchCdp.send('Fetch.enable', {
          patterns: [{ requestStage: 'Request' }],
        });
        fetchCdp.on('Fetch.requestPaused', async (event) => {
          try {
            await fetchCdp?.send('Fetch.continueRequest', { requestId: event.requestId });
          } catch {
            /* 会话可能已随注入完成被关闭 */
          }
        });
      } catch (fetchErr: unknown) {
        logger.warn(`启用导航拦截失败（继续无拦截注入）:`, fetchErr);
        fetchCdp = null;
      }
      const releaseNavigation = async () => {
        if (fetchCdp) {
          try {
            await fetchCdp.send('Fetch.disable');
            await fetchCdp.detach();
          } catch {
            /* 已关闭 */
          }
          fetchCdp = null;
        }
      };
      page.on('dialog', async (dialog) => {
        await dialog.dismiss();
      });

      if (page.isClosed() || page.url().startsWith('devtools://') || page.url().startsWith('file://')) {
        await releaseNavigation();
        return;
      }
      logger.debug(`新页面目标创建，准备注入指纹 (sessionId: ${sessionId}, url: ${page.url()})`);

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

      logger.info(`成功注入指纹到新页面 (sessionId: ${sessionId}, url: ${page.url()})`);

      if (!fingerprint) {
        await releaseNavigation();
        return;
      }
      const fingerprintInjector = new FingerprintInjector();
      await fingerprintInjector.attachFingerprintToPuppeteer(
        page as unknown as Parameters<typeof fingerprintInjector.attachFingerprintToPuppeteer>[0],
        fingerprint
      );
      // 兜底：evaluateOnNewDocument 只对未来导航生效；若本页在注入注册前已开始加载
      // （首个 newPage 的紧时序场景），已加载文档拿不到指纹脚本 → 对当前文档补发一次。
      try {
        await page.evaluate(fingerprintInjector.getInjectableScript(fingerprint));
      } catch {
        /* 页面可能已导航/关闭，evaluateOnNewDocument 已覆盖后续导航 */
      }
      // 注意：不再叠加额外的 Page.setDeviceMetricsOverride。
      // attachFingerprintToPuppeteer 内部已用 fingerprint.screen 统一设置；
      // 此前再用 viewport 覆写会把 screen 拉平为 viewport 尺寸，导致新 Tab 与
      // primaryPage 的 screen 指纹分叉（TIER-101/102 的根因之一）。

      await releaseNavigation();
      logger.info(`新 Tab 注入完成并放行导航 (sessionId: ${sessionId}, url: ${page.url()})`);
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
