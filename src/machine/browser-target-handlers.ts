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

export function createTargetHandler(sessionId: string, fingerprint: BrowserFingerprintWithHeaders) {
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

      const fingerprintInjector = new FingerprintInjector();
      await fingerprintInjector.attachFingerprintToPuppeteer(
        page as unknown as Parameters<typeof fingerprintInjector.attachFingerprintToPuppeteer>[0],
        fingerprint
      );
      const currentViewport = await page.viewport();
      if (!currentViewport) return;

      await page.setViewport({ width: currentViewport.width, height: currentViewport.height });
      await (
        await page.createCDPSession()
      ).send('Page.setDeviceMetricsOverride', {
        screenHeight: currentViewport.height,
        screenWidth: currentViewport.width,
        width: currentViewport.width,
        height: currentViewport.height,
        mobile: /phone|android|mobile/i.test(fingerprint.fingerprint.navigator.userAgent),
        screenOrientation:
          currentViewport.height > currentViewport.width
            ? { angle: 0, type: 'portraitPrimary' }
            : { angle: 90, type: 'landscapePrimary' },
        deviceScaleFactor: fingerprint.fingerprint.screen.devicePixelRatio,
      });
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
