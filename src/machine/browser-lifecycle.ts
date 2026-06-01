import { Browser, Target } from 'puppeteer-core';
import fsSync from 'fs';
import fs from 'fs/promises';
import ProxyChain from 'proxy-chain';
import puppeteerStealth from 'puppeteer-extra';
import { logger } from '@shared/utils/logger.js';
import type { BrowserLaunchOptions, BrowserInstance } from './types.js';
import { DEFAULT_SESSION_CONFIG } from './browser-constants.js';
import { calculateUserDataDir, ensureUserDataDir, generateFingerprint } from './browser-utils.js';
import { createTargetHandler, handleTargetChangeHandler, createDisconnectHandler } from './browser-target-handlers.js';
import type { ConnectionState } from './browser-connection.js';
import { convertPuppeteerOptions as convertPuppeteerOptionsFn } from './session_handlers/puppeteer-config.js';
import { CLIPBOARD_INTERCEPTOR_SCRIPT } from './session_handlers/clipboard-constants.js';
import { injectFocusinScript, injectMouseTrackingScript } from './session_handlers/page-inject.js';
import { applyFingerprintToPage } from './browser-utils.js';
import { CONFIG } from './config.js';

const puppeteer = puppeteerStealth.default;

export interface LifecycleState extends ConnectionState {
  userSharedBrowsers: Map<number, string>;
  takeScreenshot(sessionId: string): Promise<string | undefined>;
  closeBrowser(sessionId: string): Promise<boolean>;
}

export async function launchBrowser(
  state: LifecycleState,
  sessionId: string,
  options: BrowserLaunchOptions = {}
): Promise<BrowserInstance> {
  try {
    if (state.sessions.size >= CONFIG.maxSessions) {
      const error = new Error(`已达到最大并发会话数上限 (${CONFIG.maxSessions})，请稍后再试`) as Error & {
        code?: string;
      };
      (error as unknown as Record<string, unknown>).code = 'MAX_SESSIONS_REACHED';
      throw error;
    }
    logger.info(`开始启动浏览器 (sessionId: ${sessionId})`);
    const timeout = 120000;
    const userId = (options as Record<string, unknown>).userId as number | undefined;
    const sharedUserData = options.sharedUserData || false;

    if (sharedUserData && userId) {
      const existingSessionId = state.userSharedBrowsers.get(userId);
      if (existingSessionId) {
        const existingSession = state.sessions.get(existingSessionId);
        if (existingSession) {
          const error = new Error(
            `您已有一个活跃的共享数据会话 (ID: ${existingSessionId})。` +
              `每个用户同时只能有 1 个共享数据会话。` +
              `请先关闭现有会话，或使用独立会话模式（不设置 sharedUserData）。`
          ) as Error & { code?: string; existingSessionId?: string; userId?: number };
          (error as unknown as Record<string, unknown>).code = 'SHARED_SESSION_EXISTS';
          (error as unknown as Record<string, unknown>).existingSessionId = existingSessionId;
          (error as unknown as Record<string, unknown>).userId = userId;
          throw error;
        }
        state.userSharedBrowsers.delete(userId);
        logger.info(`清理失效的共享浏览器记录 (userId: ${userId})`);
      }
    }

    let userDataDir = options.userDataDir;
    if (!userDataDir) {
      userDataDir = calculateUserDataDir(userId, sessionId, sharedUserData);
      ensureUserDataDir(userDataDir);
      options.userDataDir = userDataDir;
    }

    if (!options.fingerprintOptions) {
      options.fingerprintOptions = { enabled: true };
    }
    const fingerprint = generateFingerprint(options);
    if (fingerprint && !options.userAgent) {
      options.userAgent = fingerprint.fingerprint.navigator.userAgent;
    }
    const initialConfig = {
      ...DEFAULT_SESSION_CONFIG,
      ...(options.sessionConfig || {}),
    };
    logger.info(`Initial session config for ${sessionId}: ${JSON.stringify(initialConfig)}`);
    if (options.proxy) {
      const newProxyUrl = await ProxyChain.anonymizeProxy(options.proxy);
      options.proxy = newProxyUrl;
    }

    const puppeteerOptions = await convertPuppeteerOptionsFn(options);
    let launchTimedOut = false;
    const browserPromise = puppeteer.launch(puppeteerOptions as Parameters<typeof puppeteer.launch>[0]);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        launchTimedOut = true;
        reject(new Error(`启动浏览器超时 (${timeout}ms)`));
      }, timeout);
    });

    let browser: import('puppeteer').Browser;
    try {
      browser = await Promise.race([browserPromise, timeoutPromise]);
    } catch (launchError: unknown) {
      if (launchTimedOut) {
        browserPromise
          .then(async (orphanedBrowser) => {
            try {
              const proc = orphanedBrowser.process();
              if (proc && proc.pid) {
                process.kill(proc.pid, 'SIGKILL');
                logger.warn(`已清理超时启动的孤儿浏览器进程 (PID: ${proc.pid}, sessionId: ${sessionId})`);
              }
              await orphanedBrowser.close().catch((e: unknown) => {
                logger.debug('Error closing orphaned browser:', (e as Error)?.message);
              });
            } catch (killErr: unknown) {
              logger.warn(`清理超时孤儿浏览器进程失败 (sessionId: ${sessionId}):`, killErr);
            }
          })
          .catch(() => {});
      }
      throw launchError;
    }

    const primaryPage = (await browser.pages())[0];
    if (options.viewport && primaryPage) {
      try {
        await primaryPage.setViewport(options.viewport);
        logger.info(`Viewport 已设置: ${options.viewport.width}x${options.viewport.height}`);
      } catch (viewportError: unknown) {
        logger.warn('设置 Viewport 失败:', viewportError);
      }
    }
    if (options.timezone && primaryPage) {
      try {
        await primaryPage.emulateTimezone(options.timezone);
        logger.info(`时区已设置: ${options.timezone}`);
      } catch (timezoneError: unknown) {
        logger.warn('设置时区失败:', timezoneError);
      }
    }

    if (options.storageStatePath || options.storageState) {
      try {
        let storageState = options.storageState;
        if (options.storageStatePath && !storageState) {
          logger.info(`从文件加载 storageState: ${options.storageStatePath}`);
          const storageContent = await fs.readFile(options.storageStatePath, 'utf-8');
          storageState = JSON.parse(storageContent);
        }
        if (storageState?.cookies && Array.isArray(storageState.cookies)) {
          try {
            await primaryPage.setCookie(...storageState.cookies);
            logger.info('Cookies 设置成功');
          } catch (cookieError: unknown) {
            logger.warn('设置 Cookies 失败:', cookieError);
          }
        }
        if (storageState?.origins && Array.isArray(storageState.origins)) {
          for (const origin of storageState.origins) {
            try {
              await primaryPage.goto(origin.origin, { waitUntil: 'domcontentloaded', timeout: 10000 });
              await primaryPage.evaluate((items) => {
                items.forEach((item) => {
                  localStorage.setItem(item.name, item.value);
                });
              }, origin.localStorage);
              logger.info(`localStorage 设置成功: ${origin.origin}`);
            } catch (originError: unknown) {
              logger.warn(`设置 localStorage 失败 (${origin.origin}):`, originError);
            }
          }
        }
      } catch (error: unknown) {
        logger.error('处理 storageState 时出错:', error);
      }
    }

    if (fingerprint) {
      try {
        const disconnectAction = () =>
          state
            .closeBrowser(sessionId)
            .catch((error: unknown) => logger.error(`关闭断开连接的浏览器时出错 (sessionId: ${sessionId}):`, error));
        browser.on(
          'targetcreated',
          createTargetHandler(sessionId, fingerprint) as unknown as Parameters<typeof browser.on>[1]
        );
        browser.on(
          'targetchanged',
          handleTargetChangeHandler(sessionId) as unknown as Parameters<typeof browser.on>[1]
        );
        browser.on('disconnected', createDisconnectHandler(sessionId, options.proxy ?? '', disconnectAction));
        logger.info(`已设置浏览器事件监听 (sessionId: ${sessionId})`);
      } catch (error: unknown) {
        logger.error(`设置指纹事件监听失败 (sessionId: ${sessionId}):`, error);
      }
    } else {
      const disconnectAction = () =>
        state
          .closeBrowser(sessionId)
          .catch((error: unknown) => logger.error(`关闭断开连接的浏览器时出错 (sessionId: ${sessionId}):`, error));
      browser.on('disconnected', createDisconnectHandler(sessionId, options.proxy ?? '', disconnectAction));
    }
    browser.on('targetcreated', (async (target: Target) => {
      if (target.type() === 'page') {
        const newPage = await target.page();
        if (newPage && !newPage.url().startsWith('devtools://')) {
          state.emit('tabCreated', sessionId, newPage);
        }
      }
    }) as unknown as Parameters<typeof browser.on>[1]);

    try {
      if (primaryPage) {
        await injectFocusinScript(sessionId, primaryPage as unknown as import('puppeteer-core').Page);
        await injectMouseTrackingScript(primaryPage as unknown as import('puppeteer-core').Page);
        logger.info(`focusin & mouse tracking injected on primaryPage for session ${sessionId}`);
      }
    } catch (focusErr: unknown) {
      logger.warn(`Failed to inject focusin on primaryPage for session ${sessionId}:`, focusErr);
    }
    try {
      await primaryPage.evaluateOnNewDocument(CLIPBOARD_INTERCEPTOR_SCRIPT);
      await primaryPage.evaluate(CLIPBOARD_INTERCEPTOR_SCRIPT);
    } catch (primaryClipErr: unknown) {
      logger.warn(`Failed to inject clipboard on primary page (session: ${sessionId}):`, primaryClipErr);
    }
    await primaryPage
      .evaluateOnNewDocument(() => {
        document.addEventListener(
          'click',
          (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file') {
              e.preventDefault();
              e.stopPropagation();
              window.__fileInputClickEvent = {
                timestamp: Date.now(),
                accept: (target as HTMLInputElement).accept || null,
                multiple: (target as HTMLInputElement).multiple || false,
              };
            }
          },
          true
        );
      })
      .catch((e: unknown) => {
        logger.debug('Error injecting file input interceptor:', (e as Error)?.message);
      });

    try {
      await primaryPage.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      await primaryPage.evaluate(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      await primaryPage.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      });
      await primaryPage.evaluateOnNewDocument(() => {
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
      await primaryPage.evaluate(() => {
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
      await primaryPage.evaluateOnNewDocument(() => {
        Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
        Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
      });
      await primaryPage.evaluate(() => {
        Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
        Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
      });
      await primaryPage.evaluateOnNewDocument(() => {
        if (window.chrome && !window.chrome.runtime) {
          window.chrome.runtime = {
            connect: function () {},
            sendMessage: function () {},
            onMessage: { addListener: function () {}, removeListener: function () {} },
            id: undefined,
          };
        }
      });
      await primaryPage.evaluate(() => {
        if (window.chrome && !window.chrome.runtime) {
          window.chrome.runtime = {
            connect: function () {},
            sendMessage: function () {},
            onMessage: { addListener: function () {}, removeListener: function () {} },
            id: undefined,
          };
        }
      });
      logger.info(`Anti-detection injects applied on primaryPage for session ${sessionId}`);
    } catch (antiDetectErr: unknown) {
      logger.warn(`Failed to apply anti-detection on primaryPage (session: ${sessionId}):`, antiDetectErr);
    }

    if (fingerprint) {
      try {
        await applyFingerprintToPage(primaryPage as unknown as import('puppeteer').Page, fingerprint);
        logger.info(`Fingerprint injected on primaryPage for session ${sessionId}`);
      } catch (fpErr: unknown) {
        logger.warn(`Failed to inject fingerprint on primaryPage (session: ${sessionId}):`, fpErr);
      }
    }

    const browserWSEndpoint = browser.wsEndpoint();
    const wsUrl = new URL(browserWSEndpoint);
    const port = parseInt(wsUrl.port, 10);
    const wsPath = wsUrl.pathname;
    const now = Date.now();
    state.sessions.set(sessionId, {
      port,
      browser: browser as unknown as Browser,
      path: wsPath,
      lastActivity: now,
      startTime: now,
      wsEndpoint: browserWSEndpoint,
      config: initialConfig,
      fingerprint: fingerprint ?? undefined,
      userId,
      sessionId,
      sharedUserData,
      userDataDir,
    });
    logger.info(
      `浏览器已启动 (sessionId: ${sessionId}, port: ${port}, path: ${wsPath}, userDataDir: ${userDataDir}, sharedUserData: ${sharedUserData})`
    );

    if (sharedUserData && userId) {
      state.userSharedBrowsers.set(userId, sessionId);
      logger.info(`注册共享浏览器 (userId: ${userId}, sessionId: ${sessionId})`);
    }

    const screenshotUrl = await state.takeScreenshot(sessionId);
    return { browserWSEndpoint, port, path: wsPath, screenshotUrl };
  } catch (error: unknown) {
    logger.error(`启动浏览器失败 (sessionId: ${sessionId}):`, error);
    await cleanupFailedLaunch(state, sessionId);
    throw error;
  }
}

function cleanupSessionMaps(state: LifecycleState, sessionId: string): void {
  state.sessions.delete(sessionId);
  state.connections.delete(sessionId);
  if (state.disconnectionTimers.has(sessionId)) {
    clearTimeout(state.disconnectionTimers.get(sessionId)!);
    state.disconnectionTimers.delete(sessionId);
  }
}

export async function cleanupFailedLaunch(state: LifecycleState, sessionId: string): Promise<void> {
  const session = state.sessions.get(sessionId);
  if (session && session.browser) {
    try {
      if (session.browser.process() != null) {
        await session.browser.close();
        logger.info(`Cleaned up potentially dangling browser process for failed launch (sessionId: ${sessionId})`);
      }
    } catch (closeError: unknown) {
      logger.warn(`清理失败启动的浏览器时出错 (sessionId: ${sessionId}):`, closeError);
    }
  }
  cleanupSessionMaps(state, sessionId);
  logger.info(`Cleaned up session state for failed launch (sessionId: ${sessionId})`);
}

export async function closeBrowser(state: LifecycleState, sessionId: string): Promise<boolean> {
  const sessionRef = state.sessions.get(sessionId);
  if (!sessionRef) {
    logger.warn(`关闭浏览器：会话不存在 (sessionId: ${sessionId})`);
    return false;
  }
  const userDataDir = sessionRef.userDataDir;
  const isSharedUserData = sessionRef.sharedUserData;
  const sessionUserId = sessionRef.userId;
  const sessionStartTime = sessionRef.startTime;
  const sessionSharedUserData = sessionRef.sharedUserData;

  try {
    const connection = state.connections.get(sessionId);
    let totalConnectedTime = connection ? connection.totalConnectedTime : 0;
    if (!connection && sessionStartTime) {
      totalConnectedTime = Math.floor((Date.now() - sessionStartTime) / 1000);
    }

    if (sessionSharedUserData && sessionUserId) {
      const registeredSessionId = state.userSharedBrowsers.get(sessionUserId);
      if (registeredSessionId === sessionId) {
        state.userSharedBrowsers.delete(sessionUserId);
        logger.info(`清理共享浏览器记录 (userId: ${sessionUserId}, sessionId: ${sessionId})`);
      }
    }

    try {
      await sessionRef.browser.close();
    } catch (closeErr: unknown) {
      logger.error(`关闭浏览器进程失败 (sessionId: ${sessionId}):`, closeErr);
      try {
        const proc = sessionRef.browser.process();
        if (proc && proc.pid) {
          process.kill(proc.pid, 'SIGKILL');
          logger.warn(`已强制终止浏览器进程 (PID: ${proc.pid}, sessionId: ${sessionId})`);
        }
      } catch (killErr: unknown) {
        logger.warn(`强制终止浏览器进程失败 (sessionId: ${sessionId}):`, killErr);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    if (userDataDir && !isSharedUserData) {
      try {
        if (fsSync.existsSync(userDataDir)) {
          fsSync.rmSync(userDataDir, { recursive: true, force: true });
          logger.info(`已清理独立会话的用户数据目录 (sessionId: ${sessionId}): ${userDataDir}`);
        }
      } catch (error: unknown) {
        logger.error(`清理用户数据目录失败 (sessionId: ${sessionId}):`, error);
      }
    }

    cleanupSessionMaps(state, sessionId);
    try {
      const { fileService } = await import('./services/file.service.js');
      await fileService.cleanupSessionFiles(sessionId);
    } catch (cleanupError: unknown) {
      logger.warn(`清理会话临时文件失败 (${sessionId}):`, cleanupError);
    }

    state.emit('sessionClosed', sessionId, totalConnectedTime);
    logger.info(`浏览器已关闭 (sessionId: ${sessionId}, 总连接时长: ${totalConnectedTime}秒)`);
    return true;
  } catch (error: unknown) {
    logger.error(`关闭浏览器失败 (sessionId: ${sessionId}):`, error);

    if (sessionSharedUserData && sessionUserId) {
      state.userSharedBrowsers.delete(sessionUserId);
      logger.info(`清理共享浏览器记录 (userId: ${sessionUserId}, sessionId: ${sessionId})`);
    }

    cleanupSessionMaps(state, sessionId);
    return false;
  }
}

export async function closeAllBrowsers(
  state: LifecycleState,
  closeBrowserFn: (sessionId: string) => Promise<boolean>,
  stopActivityReportingFn: () => void
): Promise<void> {
  const promises: Promise<boolean>[] = [];
  for (const sessionId of state.sessions.keys()) {
    promises.push(closeBrowserFn(sessionId));
  }

  await Promise.all(promises);
  logger.info('所有浏览器实例已关闭');

  stopActivityReportingFn();
}
