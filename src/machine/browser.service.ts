import { Page, Browser, LaunchOptions, Target } from 'puppeteer-core';
import fsSync from 'fs';

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FingerprintInjector } from 'fingerprint-injector';
import { BrowserFingerprintWithHeaders, FingerprintGenerator } from 'fingerprint-generator';
import { CONFIG } from './config.js';
import { logger } from '@shared/utils/logger.js';
import { sessionFocusEmitter } from './utils.js';
import puppeteerStealth from 'puppeteer-extra';
import ProxyChain from 'proxy-chain';
const puppeteer = puppeteerStealth.default;
// puppeteer.use(StealthPlugin());
// puppeteer.use(AdblockerPlugin.default({ blockTrackers: true }));

declare global {
  interface Window {
    _mouseTrackingInjected?: boolean;
    updateMousePosition?: (_x: number, _y: number, _viewportWidth: number, _viewportHeight: number) => void;
  }
}

// !! 更新：会话配置接口 !!
export interface SessionConfig {
  fps?: number;
  clip?: { x: number; y: number; width: number; height: number };
  interactionMode?: 'general_navigation' | 'captcha_slider' | 'form_input' | string;
  touchMode?: 'touchpad' | 'touch';

  // 文件上传状态
  uploadStates?: {
    [filename: string]: {
      filePath: string;
      fileName: string;
      totalChunks: number;
      receivedChunks: number;
      fileSize: number;
    };
  };
}

// 浏览器选项接口
export interface BrowserOptions {
  userAgent?: string;
  proxy?: string;
  proxyBypass?: string;
  viewport?: { width: number; height: number };
  args?: string[];
  defaultViewport?: { width: number; height: number };
  headless?: boolean;
  timezone?: string;
  // 指纹相关选项
  fingerprintOptions?: {
    enabled?: boolean; // 是否启用指纹注入
    devices?: ('desktop' | 'mobile')[];
    operatingSystems?: ('windows' | 'macos' | 'linux' | 'android' | 'ios')[];
    browsers?: ('chrome' | 'firefox' | 'safari' | 'edge')[];
  };

  // 状态持久化参数
  storageStatePath?: string; // 从文件加载存储状态

  storageState?: {
    // 直接传递存储状态对象
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>;
    origins?: Array<{
      origin: string;
      localStorage: Array<{ name: string; value: string }>;
    }>;
  };

  // 共享用户数据目录
  // 当 sharedUserData 为 true 时，所有会话共享同一个用户数据目录
  // 当 sharedUserData 为 false 或未设置时，每个会话有独立的用户数据目录
  sharedUserData?: boolean;

  // @deprecated 出于安全考虑，不再允许客户端指定任意路径
  userDataDir?: string; // 用户数据目录路径
}

// 浏览器选项接口
export interface BrowserLaunchOptions extends BrowserOptions {
  // 重命名以区分
  // 增加 sessionConfig 选项，用于传递初始配置
  sessionConfig?: Partial<SessionConfig>;
}

// 浏览器实例接口 (返回给 API 调用者)
export interface BrowserInstance {
  browserWSEndpoint: string;
  port: number;
  path: string;
  screenshotUrl?: string;
}

// 会话信息接口 (内部存储)
interface SessionInfo {
  port: number;
  browser: Browser;
  path: string;
  lastActivity: number;
  startTime: number;
  screenshotUrl?: string;
  fingerprint?: BrowserFingerprintWithHeaders;
  wsEndpoint: string;
  // !! 新增：存储当前会话配置 !!
  config: SessionConfig;
  // !! 新增：存储用户ID和会话ID用于计算userDataDir !!
  userId?: number;
  sessionId?: string;
  sharedUserData?: boolean;
  userDataDir?: string;
}

// 连接信息接口
interface ConnectionInfo {
  connectedAt: number;
  lastActivity: number;
  totalConnectedTime: number;
}

// 默认会话配置
const DEFAULT_SESSION_CONFIG: SessionConfig = {
  fps: 15, // 默认帧率
  interactionMode: 'general_navigation',
  touchMode: 'touchpad', // 默认模式
  // clip 默认为 undefined (全屏)
};

const CLIPBOARD_INTERCEPTOR_SCRIPT = `
  (window).__clipboardContent = '';
  var origWriteText = (navigator.clipboard)?.writeText?.bind(navigator.clipboard);
  if (origWriteText) {
    navigator.clipboard.writeText = async function (text) {
      (window).__clipboardContent = text;
      return origWriteText(text);
    };
  }
  var origWrite = (navigator.clipboard)?.write?.bind(navigator.clipboard);
  if (origWrite) {
    navigator.clipboard.write = async function (items) {
      try {
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.types && item.types.includes && item.types.includes('text/plain')) {
            var blob = await item.getType('text/plain');
            var text = await blob.text();
            (window).__clipboardContent = text;
          }
        }
      } catch (_) { /* ignore */ }
      return origWrite(items);
    };
  }
  var origExecCommand = document.execCommand.bind(document);
  document.execCommand = function (command, ui, value) {
    if (command === 'copy') {
      var sel = window.getSelection()?.toString();
      if (sel) (window).__clipboardContent = sel;
    }
    return origExecCommand(command, ui, value);
  };
  document.addEventListener('copy', function () {
    var selection = window.getSelection ? (window.getSelection()?.toString() || '') : '';
    if (selection) {
      (window).__clipboardContent = selection;
    }
  }, true);
  var origFileInputClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') {
      (window).__fileInputClickEvent = {
        accept: this.accept || '',
        multiple: this.multiple || false,
        timestamp: Date.now(),
      };
    }
    return origFileInputClick.apply(this, arguments);
  };
`;

/**
 * 浏览器服务类 - 专注于核心浏览器管理和能力提供
 */
export class BrowserService extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private connections: Map<string, ConnectionInfo> = new Map();
  private disconnectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private activityReportInterval: NodeJS.Timeout | null = null;

  // 共享浏览器追踪：每个用户同时最多有 1 个 shared 浏览器
  // Map<userId, sessionId>
  private userSharedBrowsers: Map<number, string> = new Map();

  constructor() {
    super();
    this.startActivityReporting();
  }

  /**
   * 计算 userDataDir 路径
   * @param userId 用户ID（可选，用于多用户隔离）
   * @param sessionId 会话ID
   * @param sharedUserData 是否共享用户数据目录
   * @returns userDataDir 路径
   */
  private calculateUserDataDir(userId: number | undefined, sessionId: string, sharedUserData: boolean = false): string {
    // 基础目录
    const baseDir = path.join(process.cwd(), 'data', 'user-data');

    if (sharedUserData && userId) {
      // 共享模式: /data/user-data/{userId}/shared/
      const sharedDir = path.join(baseDir, String(userId), 'shared');
      logger.info(`使用共享用户数据目录 (userId: ${userId}): ${sharedDir}`);
      return sharedDir;
    } else if (userId) {
      // 独立模式: /data/user-data/{userId}/sessions/{sessionId}/
      const sessionDir = path.join(baseDir, String(userId), 'sessions', sessionId);
      logger.info(`使用独立用户数据目录 (userId: ${userId}, sessionId: ${sessionId}): ${sessionDir}`);
      return sessionDir;
    } else {
      // 兼容模式（没有 userId）: /data/user-data/sessions/{sessionId}/
      const sessionDir = path.join(baseDir, 'sessions', sessionId);
      logger.info(`使用兼容模式用户数据目录 (sessionId: ${sessionId}): ${sessionDir}`);
      return sessionDir;
    }
  }

  /**
   * Chromium 锁文件列表
   * 这些文件在浏览器异常退出后会残留，导致新实例无法启动
   * SingletonLock: 主锁文件，记录进程 ID 和主机名
   * SingletonSocket: Unix socket 文件
   * SingletonCookie: 随机生成的 cookie 文件
   * lockfile: 新版 Chromium 使用的锁文件
   * Service State/目录下的锁文件也需要清理
   */
  private static readonly CHROMIUM_LOCK_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile'];

  /**
   * 需要清理锁文件的子目录列表
   */
  private static readonly CHROMIUM_LOCK_SUBDIRS = ['', 'Default', 'System Profile', 'Service State'];

  /**
   * 确保 userDataDir 目录存在，并清理残留的锁文件
   * @param userDataDir 用户数据目录路径
   */
  private ensureUserDataDir(userDataDir: string): void {
    try {
      if (!fsSync.existsSync(userDataDir)) {
        fsSync.mkdirSync(userDataDir, { recursive: true });
        logger.info(`已创建用户数据目录: ${userDataDir}`);
      }

      this.cleanLockFiles(userDataDir);
    } catch (error) {
      logger.error(`创建用户数据目录失败 (${userDataDir}):`, error);
      throw error;
    }
  }

  /**
   * 清理 Chromium 残留的锁文件
   * Docker 容器重启后，这些锁文件会残留，导致新的浏览器实例无法启动
   * 需要清理根目录和子目录中的所有锁文件
   * @param userDataDir 用户数据目录路径
   */
  private cleanLockFiles(userDataDir: string): void {
    for (const subDir of BrowserService.CHROMIUM_LOCK_SUBDIRS) {
      const dirPath = subDir ? path.join(userDataDir, subDir) : userDataDir;
      if (!fsSync.existsSync(dirPath)) {
        continue;
      }

      for (const lockFile of BrowserService.CHROMIUM_LOCK_FILES) {
        const lockPath = path.join(dirPath, lockFile);
        try {
          if (fsSync.existsSync(lockPath)) {
            fsSync.unlinkSync(lockPath);
            logger.info(`已清理残留锁文件: ${lockPath}`);
          }
        } catch (error) {
          logger.warn(`清理锁文件失败 (${lockPath}):`, error);
        }
      }
    }
  }

  /**
   * 清理独立会话的用户数据目录
   * 注意：共享会话的目录不会被清理
   * @param sessionId 会话ID
   */
  private async cleanupUserDataDir(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.userDataDir) {
      return;
    }

    // 如果是共享会话，不清理目录
    if (session.sharedUserData) {
      logger.info(`共享会话不清理用户数据目录 (sessionId: ${sessionId})`);
      return;
    }

    try {
      if (fsSync.existsSync(session.userDataDir)) {
        await fs.rm(session.userDataDir, { recursive: true, force: true });
        logger.info(`已清理独立会话的用户数据目录 (sessionId: ${sessionId}): ${session.userDataDir}`);
      }
    } catch (error) {
      logger.error(`清理用户数据目录失败 (sessionId: ${sessionId}):`, error);
    }
  }

  /**
   * 启动活动报告
   */
  private startActivityReporting() {
    this.activityReportInterval = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, connection] of this.connections.entries()) {
        if (!this.disconnectionTimers.has(sessionId)) {
          if (now - connection.lastActivity > CONFIG.sessionActivityTimeout) {
            logger.warn(`会话活动超时 (sessionId: ${sessionId})`);
            this.handleDisconnection(sessionId);
          } else {
            // !! 移除 sessionActivity emit，这个逻辑应由上层处理 !!
            // this.emit('sessionActivity', sessionId, connection.totalConnectedTime);
          }
        }
      }
    }, CONFIG.activityReportInterval);
  }

  /**
   * 停止活动报告
   */
  stopActivityReporting() {
    if (this.activityReportInterval) {
      clearInterval(this.activityReportInterval);
      this.activityReportInterval = null;
    }
  }

  /**
   * 更新会话活动时间
   */
  updateSessionActivity(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * 处理用户连接
   */
  handleConnection(sessionId: string): void {
    const now = Date.now();
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`处理连接：会话不存在 (sessionId: ${sessionId})`);
      return;
    }

    if (this.disconnectionTimers.has(sessionId)) {
      clearTimeout(this.disconnectionTimers.get(sessionId)!);
      this.disconnectionTimers.delete(sessionId);
      logger.info(`已清除断开连接计时器 (sessionId: ${sessionId})`);
    }

    const previousTotalTime = this.connections.has(sessionId) ? this.connections.get(sessionId)!.totalConnectedTime : 0;

    this.connections.set(sessionId, {
      connectedAt: now,
      lastActivity: now,
      totalConnectedTime: previousTotalTime,
    });
    // !! 移除 sessionConnected emit !!
    this.emit('sessionConnected', sessionId);
    logger.info(`用户已连接到会话 (sessionId: ${sessionId})`);
  }

  /**
   * 更新用户活动时间
   */
  updateActivity(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.lastActivity = Date.now();
      logger.debug(`已更新用户活动时间 (sessionId: ${sessionId})`);
    }
  }

  /**
   * 处理用户断开连接
   */
  handleDisconnection(sessionId: string): void {
    logger.info(`开始处理用户断开连接 (sessionId: ${sessionId})`);
    if (this.disconnectionTimers.has(sessionId)) {
      logger.warn(`断开连接处理已在进行中 (sessionId: ${sessionId})`);
      return;
    }
    const connection = this.connections.get(sessionId);
    if (connection) {
      const now = Date.now();
      const connectionDuration = Math.floor((now - connection.connectedAt) / 1000);
      connection.totalConnectedTime += connectionDuration;
      // !! 移除 sessionDisconnected emit !!
      this.emit('sessionDisconnected', sessionId, connection.totalConnectedTime);
      logger.info(
        `用户已断开会话连接 (sessionId: ${sessionId}, 本次连接时长: ${connectionDuration}秒, 总连接时长: ${connection.totalConnectedTime}秒)`
      );
    } else {
      logger.warn(`处理断开连接：找不到连接信息 (sessionId: ${sessionId})`);
    }
    logger.info(`设置断开连接计时器 (sessionId: ${sessionId}, 超时时间: ${CONFIG.disconnectionTimeout}ms)`);
    const timer = setTimeout(() => {
      logger.info(`会话连接超时，准备关闭浏览器 (sessionId: ${sessionId})`);
      this.closeBrowser(sessionId)
        .then((success) => logger.info(`超时会话浏览器关闭 ${success ? '成功' : '失败'} (sessionId: ${sessionId})`))
        .catch((error) => logger.error(`关闭超时会话浏览器出错 (sessionId: ${sessionId}):`, error));
      this.disconnectionTimers.delete(sessionId);
    }, CONFIG.disconnectionTimeout);
    this.disconnectionTimers.set(sessionId, timer);
  }

  /**
   * 生成浏览器指纹
   */
  private generateFingerprint(options: BrowserOptions = {}): BrowserFingerprintWithHeaders | null {
    try {
      // 默认启用指纹注入，除非明确指定不启用
      if (options.fingerprintOptions?.enabled === false) {
        logger.info('根据配置禁用指纹注入');
        return null;
      }

      // 创建指纹生成器
      const fingerprintGenerator = new FingerprintGenerator({
        devices: options.fingerprintOptions?.devices || ['desktop'],
        operatingSystems: options.fingerprintOptions?.operatingSystems || ['windows', 'macos', 'linux'],
        browsers: options.fingerprintOptions?.browsers || ['chrome', 'firefox', 'safari'],
      });

      // 生成指纹
      const fingerprint = fingerprintGenerator.getFingerprint();
      logger.info(`成功生成浏览器指纹: ${fingerprint.fingerprint.navigator.userAgent}`);

      return fingerprint;
    } catch (error) {
      logger.error('生成浏览器指纹失败:', error);
      return null;
    }
  }

  /**
   * 启动浏览器实例
   */
  async launchBrowser(sessionId: string, options: BrowserLaunchOptions = {}): Promise<BrowserInstance> {
    try {
      logger.info(`开始启动浏览器 (sessionId: ${sessionId})`);
      const timeout = 120000;

      // 提取 userId 和 sharedUserData 选项
      // 注意：userId 通常从 options 中传递，或者从会话上下文中获取
      const userId = (options as Record<string, unknown>).userId as number | undefined;
      const sharedUserData = options.sharedUserData || false;

      // ===== 检查用户是否已有共享浏览器 =====
      if (sharedUserData && userId) {
        const existingSessionId = this.userSharedBrowsers.get(userId);
        if (existingSessionId) {
          const existingSession = this.sessions.get(existingSessionId);
          if (existingSession) {
            // 用户已有活跃的共享浏览器
            const error = new Error(
              `您已有一个活跃的共享数据会话 (ID: ${existingSessionId})。` +
                `每个用户同时只能有 1 个共享数据会话。` +
                `请先关闭现有会话，或使用独立会话模式（不设置 sharedUserData）。`
            ) as Error & { code?: string; existingSessionId?: string; userId?: number };
            (error as unknown as Record<string, unknown>).code = 'SHARED_SESSION_EXISTS';
            (error as unknown as Record<string, unknown>).existingSessionId = existingSessionId;
            (error as unknown as Record<string, unknown>).userId = userId;
            throw error;
          } else {
            // Map 中的 sessionId 已失效，清理
            this.userSharedBrowsers.delete(userId);
            logger.info(`清理失效的共享浏览器记录 (userId: ${userId})`);
          }
        }
      }

      // 计算 userDataDir 路径
      let userDataDir = options.userDataDir;

      // 如果没有明确指定 userDataDir（已废弃），则根据 sharedUserData 计算
      if (!userDataDir) {
        userDataDir = this.calculateUserDataDir(userId, sessionId, sharedUserData);
        // 确保目录存在
        this.ensureUserDataDir(userDataDir);
        // 设置到 options 中供 convertPuppeteerOptions 使用
        options.userDataDir = userDataDir;
      }

      if (!options.fingerprintOptions) {
        options.fingerprintOptions = { enabled: true };
      }
      const fingerprint = this.generateFingerprint(options);
      if (fingerprint && !options.userAgent) {
        options.userAgent = fingerprint.fingerprint.navigator.userAgent;
      }
      const initialConfig: SessionConfig = {
        ...DEFAULT_SESSION_CONFIG,
        ...(options.sessionConfig || {}),
      };
      logger.info(`Initial session config for ${sessionId}: ${JSON.stringify(initialConfig)}`);
      if (options.proxy) {
        const newProxyUrl = await ProxyChain.anonymizeProxy(options.proxy);
        options.proxy = newProxyUrl;
      }

      const puppeteerOptions = await this.convertPuppeteerOptions(options);
      let launchTimedOut = false;
      const browserPromise = puppeteer.launch(puppeteerOptions);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          launchTimedOut = true;
          reject(new Error(`启动浏览器超时 (${timeout}ms)`));
        }, timeout);
      });

      let browser: import('puppeteer').Browser;
      try {
        browser = await Promise.race([browserPromise, timeoutPromise]);
      } catch (launchError) {
        // 如果超时了，后台的 browserPromise 仍会完成，产生孤儿进程
        // 主动 catch 并 kill 它
        if (launchTimedOut) {
          browserPromise
            .then(async (orphanedBrowser) => {
              try {
                const proc = orphanedBrowser.process();
                if (proc && proc.pid) {
                  process.kill(proc.pid, 'SIGKILL');
                  logger.warn(`已清理超时启动的孤儿浏览器进程 (PID: ${proc.pid}, sessionId: ${sessionId})`);
                }
                await orphanedBrowser.close().catch(() => {});
              } catch (killErr) {
                logger.warn(`清理超时孤儿浏览器进程失败 (sessionId: ${sessionId}):`, killErr);
              }
            })
            .catch(() => {
              // 启动本身就失败了，不需要清理
            });
        }
        throw launchError;
      }

      const primaryPage = (await browser.pages())[0];

      // 明确设置 viewport（确保 defaultViewport 生效）
      if (options.viewport && primaryPage) {
        try {
          await primaryPage.setViewport(options.viewport);
          logger.info(`✅ Viewport 已设置: ${options.viewport.width}x${options.viewport.height}`);
        } catch (viewportError) {
          logger.warn('设置 Viewport 失败:', viewportError);
        }
      }

      // 设置时区
      if (options.timezone && primaryPage) {
        try {
          await primaryPage.emulateTimezone(options.timezone);
          logger.info(`✅ 时区已设置: ${options.timezone}`);
        } catch (timezoneError) {
          logger.warn('设置时区失败:', timezoneError);
        }
      }

      // 处理 storageState - 在浏览器启动后设置 Cookie 和 localStorage
      if (options.storageStatePath || options.storageState) {
        try {
          let storageState = options.storageState;

          // 如果是路径，从文件加载
          if (options.storageStatePath && !storageState) {
            logger.info(`从文件加载 storageState: ${options.storageStatePath}`);
            const storageContent = await fs.readFile(options.storageStatePath, 'utf-8');
            storageState = JSON.parse(storageContent);
          }

          // 设置 cookies
          if (storageState?.cookies && Array.isArray(storageState.cookies)) {
            logger.info(`设置 ${storageState.cookies.length} 个 cookies`);
            try {
              await primaryPage.setCookie(...storageState.cookies);
              logger.info('✅ Cookies 设置成功');
            } catch (cookieError) {
              logger.warn('设置 Cookies 失败:', cookieError);
            }
          }

          // 设置 localStorage
          if (storageState?.origins && Array.isArray(storageState.origins)) {
            logger.info(`为 ${storageState.origins.length} 个 origin 设置 localStorage`);
            for (const origin of storageState.origins) {
              try {
                // 导航到对应 origin
                await primaryPage.goto(origin.origin, { waitUntil: 'domcontentloaded', timeout: 10000 });

                // 设置 localStorage
                await primaryPage.evaluate((items) => {
                  items.forEach((item) => {
                    localStorage.setItem(item.name, item.value);
                  });
                }, origin.localStorage);

                logger.info(`✅ localStorage 设置成功: ${origin.origin}`);
              } catch (originError) {
                logger.warn(`设置 localStorage 失败 (${origin.origin}):`, originError);
              }
            }
          }
        } catch (error) {
          logger.error('处理 storageState 时出错:', error);
        }
      }

      // 设置事件监听 (只保留必要的)
      if (fingerprint) {
        try {
          // @ts-ignore — puppeteer-core Handler<> type mismatch (dual installations on macOS)
          browser.on('targetcreated', this.createTargetHandler(sessionId, fingerprint));
          // @ts-ignore — puppeteer-core Handler<> type mismatch (dual installations on macOS)
          browser.on('targetchanged', this.handleTargetChangeHandler(sessionId));
          browser.on('disconnected', this.createDisconnectHandler(sessionId, options.proxy ?? ''));
          logger.info(`已设置浏览器事件监听 (sessionId: ${sessionId})`);
        } catch (error) {
          logger.error(`设置指纹事件监听失败 (sessionId: ${sessionId}):`, error);
        }
      } else {
        browser.on('disconnected', this.createDisconnectHandler(sessionId, options.proxy ?? ''));
      }
      // @ts-ignore — puppeteer-core Handler<> type mismatch (dual installations on macOS)
      browser.on('targetcreated', async (target: Target) => {
        if (target.type() === 'page') {
          const newPage = await target.page();
          if (newPage && !newPage.url().startsWith('devtools://')) {
            this.emit('tabCreated', sessionId, newPage);
          }
        }
      });
      logger.info('primaryPage', primaryPage);

      // 为 primaryPage 注入 focusin 脚本（targetcreated 不会触发初始页面）
      try {
        await this.injectFocusinScript(sessionId, primaryPage as any);
        await this.injectMouseTrackingScript(primaryPage as any);
        logger.info(`focusin & mouse tracking injected on primaryPage for session ${sessionId}`);
      } catch (focusErr) {
        logger.warn(`Failed to inject focusin on primaryPage for session ${sessionId}:`, focusErr);
      }

      try {
        // 1. evaluateOnNewDocument so interceptor survives navigation
        await primaryPage.evaluateOnNewDocument(CLIPBOARD_INTERCEPTOR_SCRIPT);
        // 2. Also inject immediately for current page
        await primaryPage.evaluate(CLIPBOARD_INTERCEPTOR_SCRIPT);
      } catch (primaryClipErr) {
        logger.warn(`Failed to inject clipboard on primary page (session: ${sessionId}):`, primaryClipErr);
      }

      // Intercept file input clicks and signal via __fileInputClickEvent flag
      await primaryPage
        .evaluateOnNewDocument(() => {
          document.addEventListener(
            'click',
            (e) => {
              const target = e.target as HTMLElement;
              if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file') {
                e.preventDefault();
                e.stopPropagation();
                (window as any).__fileInputClickEvent = {
                  timestamp: Date.now(),
                  accept: (target as HTMLInputElement).accept || null,
                  multiple: (target as HTMLInputElement).multiple || false,
                };
              }
            },
            true
          );
        })
        .catch((_: any) => void _);

      const browserWSEndpoint = browser.wsEndpoint();
      const wsUrl = new URL(browserWSEndpoint);
      const port = parseInt(wsUrl.port, 10);
      const path = wsUrl.pathname;
      const now = Date.now();
      this.sessions.set(sessionId, {
        port,
        // @ts-ignore — Browser type mismatch (dual puppeteer-core installations on macOS)
        browser,
        path,
        lastActivity: now,
        startTime: now,
        wsEndpoint: browserWSEndpoint,
        config: initialConfig,
        fingerprint: fingerprint ?? undefined,
        // 新增：存储用户数据相关信息
        userId,
        sessionId,
        sharedUserData,
        userDataDir,
      });
      logger.info(
        `浏览器已启动 (sessionId: ${sessionId}, port: ${port}, path: ${path}, userDataDir: ${userDataDir}, sharedUserData: ${sharedUserData})`
      );

      // ===== 注册共享浏览器 =====
      if (sharedUserData && userId) {
        this.userSharedBrowsers.set(userId, sessionId);
        logger.info(`注册共享浏览器 (userId: ${userId}, sessionId: ${sessionId})`);
      }

      const screenshotUrl = await this.takeScreenshot(sessionId); // 生成初始截图 URL
      return { browserWSEndpoint, port, path, screenshotUrl };
    } catch (error) {
      logger.error(`启动浏览器失败 (sessionId: ${sessionId}):`, error);
      await this.cleanupFailedLaunch(sessionId);
      throw error;
    }
  }

  /**
   * !! 新增：清理启动失败的会话状态 !!
   */
  private async cleanupFailedLaunch(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.browser) {
      try {
        // Attempt to close the browser if it exists and might be partially launched
        if (session.browser.process() != null) {
          // Check if the process was spawned
          await session.browser.close();
          logger.info(`Cleaned up potentially dangling browser process for failed launch (sessionId: ${sessionId})`);
        }
      } catch (closeError) {
        logger.warn(`清理失败启动的浏览器时出错 (sessionId: ${sessionId}):`, closeError);
      }
    }
    // Clean up maps regardless of browser closing success
    this.sessions.delete(sessionId);
    this.connections.delete(sessionId);
    if (this.disconnectionTimers.has(sessionId)) {
      clearTimeout(this.disconnectionTimers.get(sessionId)!);
      this.disconnectionTimers.delete(sessionId);
    }
    logger.info(`Cleaned up session state for failed launch (sessionId: ${sessionId})`);
  }

  /**
   * 关闭浏览器实例
   */
  async closeBrowser(sessionId: string): Promise<boolean> {
    const sessionRef = this.sessions.get(sessionId);
    if (!sessionRef) {
      logger.warn(`关闭浏览器：会话不存在 (sessionId: ${sessionId})`);
      return false;
    }
    // 在 try 之前捕获所有需要的字段，确保 catch 分支也能访问
    const userDataDir = sessionRef.userDataDir;
    const isSharedUserData = sessionRef.sharedUserData;
    const sessionUserId = sessionRef.userId;
    const sessionStartTime = sessionRef.startTime;
    const sessionSharedUserData = sessionRef.sharedUserData;

    try {
      const connection = this.connections.get(sessionId);
      let totalConnectedTime = connection ? connection.totalConnectedTime : 0;
      if (!connection && sessionStartTime) {
        totalConnectedTime = Math.floor((Date.now() - sessionStartTime) / 1000);
      }

      // ===== 清理共享浏览器记录 =====
      if (sessionSharedUserData && sessionUserId) {
        const registeredSessionId = this.userSharedBrowsers.get(sessionUserId);
        if (registeredSessionId === sessionId) {
          this.userSharedBrowsers.delete(sessionUserId);
          logger.info(`清理共享浏览器记录 (userId: ${sessionUserId}, sessionId: ${sessionId})`);
        }
      }

      try {
        await sessionRef.browser.close();
      } catch (closeErr) {
        logger.error(`关闭浏览器进程失败 (sessionId: ${sessionId}):`, closeErr);
        // browser.close() 失败时，强制 kill 子进程防止僵尸
        try {
          const proc = sessionRef.browser.process();
          if (proc && proc.pid) {
            process.kill(proc.pid, 'SIGKILL');
            logger.warn(`已强制终止浏览器进程 (PID: ${proc.pid}, sessionId: ${sessionId})`);
          }
        } catch (killErr) {
          logger.warn(`强制终止浏览器进程失败 (sessionId: ${sessionId}):`, killErr);
        }
      }

      // 等待 OS 释放文件锁
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 清理独立会话的用户数据目录（共享会话不会被清理）
      if (userDataDir && !isSharedUserData) {
        try {
          if (fsSync.existsSync(userDataDir)) {
            fsSync.rmSync(userDataDir, { recursive: true, force: true });
            logger.info(`已清理独立会话的用户数据目录 (sessionId: ${sessionId}): ${userDataDir}`);
          }
        } catch (error) {
          logger.error(`清理用户数据目录失败 (sessionId: ${sessionId}):`, error);
        }
      }

      this.sessions.delete(sessionId);

      this.connections.delete(sessionId);
      if (this.disconnectionTimers.has(sessionId)) {
        clearTimeout(this.disconnectionTimers.get(sessionId)!);
        this.disconnectionTimers.delete(sessionId);
      }
      // 清理会话临时文件
      try {
        const { fileService } = await import('./services/file.service.js');
        await fileService.cleanupSessionFiles(sessionId);
      } catch (cleanupError) {
        logger.warn(`清理会话临时文件失败 (${sessionId}):`, cleanupError);
      }

      // !! 移除 sessionClosed emit !!
      this.emit('sessionClosed', sessionId, totalConnectedTime);
      logger.info(`浏览器已关闭 (sessionId: ${sessionId}, 总连接时长: ${totalConnectedTime}秒)`);
      return true;
    } catch (error) {
      logger.error(`关闭浏览器失败 (sessionId: ${sessionId}):`, error);

      // ===== 清理共享浏览器记录（使用 try 之前捕获的字段）=====
      if (sessionSharedUserData && sessionUserId) {
        this.userSharedBrowsers.delete(sessionUserId);
        logger.info(`清理共享浏览器记录 (userId: ${sessionUserId}, sessionId: ${sessionId})`);
      }

      this.sessions.delete(sessionId);
      this.connections.delete(sessionId);
      if (this.disconnectionTimers.has(sessionId)) {
        clearTimeout(this.disconnectionTimers.get(sessionId)!);
        this.disconnectionTimers.delete(sessionId);
      }
      return false;
    }
  }

  /**
   * 关闭所有浏览器实例
   */
  async closeAllBrowsers(): Promise<void> {
    const promises: Promise<boolean>[] = [];

    for (const sessionId of this.sessions.keys()) {
      promises.push(this.closeBrowser(sessionId));
    }

    await Promise.all(promises);
    logger.info('所有浏览器实例已关闭');

    // 停止活动报告
    this.stopActivityReporting();
  }

  /**
   * 获取会话端口
   */
  getPort(sessionId: string): number | null {
    const session = this.sessions.get(sessionId);
    return session ? session.port : null;
  }

  /**
   * 获取会话路径
   */
  getPath(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    return session ? session.path : null;
  }

  /**
   * 获取活跃会话数
   */
  getActiveSessions(): number {
    return this.sessions.size;
  }

  /**
   * 转换浏览器选项
   */
  async convertPuppeteerOptions(options: BrowserOptions = {}): Promise<any> {
    // 将选项转换为 puppeteer-core 选项
    const result: LaunchOptions = {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--remote-allow-origins=localhost',
        '--remote-debugging-port=0',
        '--disable-dev-shm-usage',
        '--disable-responsive-ui',
        '--force-device-scale-factor=1',
        // 已移除 --disable-gpu 以支持 WebGL (反机器人检测需要)
        '--headless=new',
        // "--disable-web-security",
        '--disable-setuid-sandbox',
        // 已移除 --use-angle=disabled 以支持 WebGL (反机器人检测需要)
        '--disable-blink-features=AutomationControlled',
        '--webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--force-webrtc-ip-handling-policy',
        '--remote-debugging-address=127.0.0.1',
      ],
      // headless: false,
      headless: true,
      executablePath: CONFIG.chromePath,
      protocolTimeout: 60000,
    };

    // 处理 userDataDir - 必须在启动时传递
    if (options.userDataDir) {
      result.args!.push(`--user-data-dir=${options.userDataDir}`);
      logger.info(`设置 userDataDir: ${options.userDataDir}`);
    }

    if (options.args && Array.isArray(options.args)) {
      result.args!.push(...options.args);
    }

    if (options.userAgent) {
      result.args!.push(`--user-agent=${options.userAgent}`);
    }

    if (options.proxy) {
      result.args!.push(`--proxy-server=${options.proxy}`);
    }

    if (options.proxyBypass) {
      result.args!.push(`--proxy-bypass-list=${options.proxyBypass}`);
    }

    if (options.viewport) {
      result.args!.push(`--window-size=${options.viewport.width},${options.viewport.height}`);
    }

    if (options.defaultViewport) {
      result.defaultViewport = options.defaultViewport;
    } else if (options.viewport) {
      result.defaultViewport = {
        width: options.viewport.width || 1280,
        height: options.viewport.height || 800,
        deviceScaleFactor: 1,
      };
    } else {
      result.defaultViewport = {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
      };
    }

    logger.info('result', result);

    return result;
  }

  async injectFocusinScript(sessionId: string, page: Page): Promise<void> {
    // --- BEGIN: Injection and Expose Logic ---
    const dynamicFunctionName = `_focusHandler_${sessionId.replace(/\W/g, '_')}`;

    // 1. Inject persistent listener via evaluateOnNewDocument

    await page.evaluateOnNewDocument((fnName) => {
      // document.removeEventListener('focusin', handleFocusin);
      document.addEventListener('focusin', function (event) {
        if (typeof (window as unknown as Record<string, unknown>)[fnName] === 'function') {
          console.log('focusin', event.target);
          (window as unknown as Record<string, () => void>)[fnName](); // Call the dynamic function
        }
      });
    }, dynamicFunctionName);
    logger.info(`Persistent focus listener script injected for session ${sessionId}.`);

    // 2. Expose the bridge function *once* for this page/browser context
    try {
      await page.exposeFunction(dynamicFunctionName, () => {
        // Node.js callback - ONLY emits the raw event with sessionId
        // Ensure page/browser isn't closed during async handling if needed
        logger.info(`Raw focus event triggered via bridge for session ${sessionId}`);
        sessionFocusEmitter.emit(`rawFocusEvent:${sessionId}`);
      });
      logger.info(`Dynamic focus bridge '${dynamicFunctionName}' exposed for session ${sessionId}.`);
    } catch (exposeError: unknown) {
      const msg = exposeError instanceof Error ? exposeError.message : String(exposeError);
      if (msg.includes('already exists')) {
        logger.warn(
          `Dynamic bridge function '${dynamicFunctionName}' likely already exposed for session ${sessionId}.`
        );
      } else {
        throw exposeError; // Rethrow other errors
      }
    }
  }

  // 注入鼠标跟踪脚本
  async injectMouseTrackingScript(page: Page): Promise<void> {
    try {
      // 为页面注入鼠标指针脚本
      await page
        .evaluateOnNewDocument(() => {
          const existingCursor = document.getElementById('remote-cursor-pointer');
          if (existingCursor) {
            existingCursor.remove();
          }

          // 创建鼠标指针元素
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

          // 当DOM加载完成后添加到body
          if (document.readyState === 'loading') {
            console.log('DOMContentLoaded', document.readyState);
            document.addEventListener('DOMContentLoaded', () => {
              document.body.appendChild(cursor);
            });
          } else {
            document.body.appendChild(cursor);
          }

          // 创建新的mousemove事件监听器

          // 保存监听器引用
          document.addEventListener('click', function (e: MouseEvent) {
            console.log('click', e.clientX, e.clientY);
          });
          // 添加新的事件监听器
          document.addEventListener('mousemove', function (e: MouseEvent) {
            // 使用原始坐标，无需缩放转换
            const cssX = e.clientX;
            const cssY = e.clientY;

            // 更新光标位置
            cursor.style.left = `${cssX}px`;
            cursor.style.top = `${cssY}px`;
            cursor.style.display = 'block';
          });
        })
        .catch((error) => {
          logger.error('injectMouseTrackingScript error:', error);
        });
    } catch (error) {
      logger.error(`Failed to inject mouse tracking script for :`, error);
    }
  }

  private handleTargetChangeHandler(_sessionId: string) {
    return async (target: Target) => {
      logger.info(`Target changed:  ${target.type()}`, target.url());
      if (target.type() === 'page') {
        const page = await target.page();
        if (!page || page.isClosed() || page.url().startsWith('devtools://')) return;
      }
    };
  }
  /**
   * 创建目标创建处理函数 (只注入指纹)
   */
  private createTargetHandler(sessionId: string, fingerprint: BrowserFingerprintWithHeaders) {
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

        await this.injectMouseTrackingScript(page as any);
        await this.injectFocusinScript(sessionId, page as any);

        try {
          const cdp = await page.createCDPSession();
          await cdp.send('Browser.grantPermissions', {
            origin: page.url() || 'http://192.168.0.29:3011/public/test-interactive.html',
            permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
          });
          logger.info(`Clipboard permissions granted for session ${sessionId}`);
        } catch (permErr) {
          logger.warn(`Failed to grant clipboard permissions for session ${sessionId}:`, permErr);
        }

        // --- BEGIN: Clipboard interception (evaluateOnNewDocument) ---
        await page.evaluateOnNewDocument(CLIPBOARD_INTERCEPTOR_SCRIPT);

        try {
          await page.evaluate(CLIPBOARD_INTERCEPTOR_SCRIPT);
        } catch (clipEvalErr) {
          logger.warn(`Failed to inject clipboard on current page for session ${sessionId}:`, clipEvalErr);
        }

        await page.evaluateOnNewDocument(() => {
          console.debug = () => {};
        });

        // 反机器人检测：隐藏 navigator.webdriver
        // 这是最关键的检测点，很多网站通过此检测自动化工具
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
          });
        });

        // 反机器人检测：注入 deviceMemory
        // deviceMemory 是设备能力指纹的一部分，桌面浏览器通常返回 8 (GB)
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'deviceMemory', {
            get: () => 8,
          });
        });

        // 这里注入 focusin 事件监听器 ？
        logger.info(`成功注入指纹到新页面 (sessionId: ${sessionId}, url: ${page.url()})`);
        // !! 移除页面监听器添加和截图逻辑 !!

        const fingerprintInjector = new FingerprintInjector();
        // @ts-ignore — Page type mismatch (dual puppeteer-core installations on macOS)
        await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);
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
      } catch (error) {
        logger.error(`处理新页面目标失败 (sessionId: ${sessionId}):`, error);
      }
    };
  }

  /**
   * 创建浏览器断开连接处理函数
   */
  private createDisconnectHandler(sessionId: string, proxy: string) {
    return () => {
      logger.warn(`浏览器实例已断开连接，将关闭会话 (sessionId: ${sessionId})`);
      if (proxy) {
        ProxyChain.closeAnonymizedProxy(proxy, true).catch((error) =>
          logger.error(`关闭断开连接的浏览器时出错 (sessionId: ${sessionId}):`, error)
        );
      }
      this.closeBrowser(sessionId).catch((error) =>
        logger.error(`关闭断开连接的浏览器时出错 (sessionId: ${sessionId}):`, error)
      );
    };
  }

  /**
   * 截取浏览器屏幕截图 (生成初始 URL, 文件可能后续生成)
   */
  async takeScreenshot(sessionId: string): Promise<string | undefined> {
    try {
      const screenshotDir = path.join(CONFIG.dataDir, 'screenshots');
      await fs.mkdir(screenshotDir, { recursive: true });
      const filename = `${sessionId}-${uuidv4()}.jpeg`;
      const filePath = path.join(screenshotDir, filename);
      const screenshotUrl = `/screenshots/${filename}`;

      const page = await this.getSessionPage(sessionId);
      if (page) {
        const buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
        await fs.writeFile(filePath, buffer);
        logger.info(`截图已保存 (sessionId: ${sessionId}): ${filePath} (${(buffer.length / 1024).toFixed(1)}KB)`);
      } else {
        const placeholder = Buffer.from([
          0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00,
          0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
          0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
        ]);
        await fs.writeFile(filePath, placeholder);
        logger.warn(`页面未就绪，写入占位图 (sessionId: ${sessionId})`);
      }

      const session = this.sessions.get(sessionId);
      if (session) {
        session.screenshotUrl = screenshotUrl;
      }
      this.emit('sessionScreenshot', sessionId, screenshotUrl);
      return screenshotUrl;
    } catch (error) {
      logger.error(`截图失败 (sessionId: ${sessionId}):`, error);
      return undefined;
    }
  }

  /** 获取 WebSocket 端点 */
  getBrowserWSEndpoint(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.wsEndpoint ?? null;
  }

  /** 获取会话的主 Page 对象 */
  async getSessionPage(sessionId: string): Promise<Page | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.browser || !session.browser.isConnected()) {
      logger.warn(`获取页面：会话或浏览器无效 (sessionId: ${sessionId})`);
      if (session) await this.closeBrowser(sessionId);
      return null;
    }
    try {
      const pages = await session.browser.pages();
      const mainPage = pages.find(
        (p) =>
          !p.isClosed() &&
          !p.url().startsWith('about:blank') &&
          !p.url().startsWith('devtools://') &&
          !p.url().startsWith('chrome-error://') &&
          !p.url().startsWith('chrome://') &&
          !p.url().startsWith('file://')
      );
      if (!mainPage && pages.length > 0) {
        return pages.find((p) => !p.isClosed()) || null;
      }
      return mainPage || null;
    } catch (error) {
      logger.error(`获取页面失败 (sessionId: ${sessionId}):`, error);
      await this.closeBrowser(sessionId);
      return null;
    }
  }

  /** 获取当前会话配置 (返回副本) */
  getSessionConfig(sessionId: string): SessionConfig | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session.config } : null;
  }

  /**
   * 更新会话配置并发出事件 (保留，因为配置是核心状态)
   */
  updateSessionConfig(sessionId: string, newConfig: Partial<SessionConfig>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`更新配置：会话不存在 (sessionId: ${sessionId})`);
      return false;
    }
    const currentConfig = session.config;
    let changed = false;
    if (newConfig.fps !== undefined && currentConfig.fps !== newConfig.fps) {
      currentConfig.fps = newConfig.fps;
      changed = true;
    }
    if (newConfig.clip !== undefined && JSON.stringify(currentConfig.clip) !== JSON.stringify(newConfig.clip)) {
      currentConfig.clip = newConfig.clip;
      changed = true;
    }
    if (newConfig.interactionMode !== undefined && currentConfig.interactionMode !== newConfig.interactionMode) {
      currentConfig.interactionMode = newConfig.interactionMode;
      if (newConfig.touchMode === undefined) {
        currentConfig.touchMode =
          currentConfig.interactionMode === 'captcha_slider' || currentConfig.interactionMode === 'touch'
            ? 'touch'
            : 'touchpad';
        logger.debug(`Implicitly updated touchMode to ${currentConfig.touchMode}`);
      }
      changed = true;
    }
    if (newConfig.touchMode !== undefined && currentConfig.touchMode !== newConfig.touchMode) {
      currentConfig.touchMode = newConfig.touchMode;
      changed = true;
    }
    if (changed) {
      this.updateSessionActivity(sessionId);
      logger.info(`会话配置已更新 (sessionId: ${sessionId}): ${JSON.stringify(currentConfig)}`);
      this.emit('configUpdated', sessionId, { ...currentConfig });
      return true;
    } else {
      logger.debug(`未检测到实际配置更改 (sessionId: ${sessionId})`);
      return false;
    }
  }

  /**
   * 获取相对于页面左上角的转换后坐标
   */
  getTransformedCoordinates(sessionId: string, x: number, y: number): { tx: number; ty: number } | null {
    const config = this.getSessionConfig(sessionId);
    if (!config) return null;
    if (config.clip) {
      const tx = config.clip.x + x;
      const ty = config.clip.y + y;
      return { tx, ty };
    }
    return { tx: x, ty: y };
  }
}

// 创建浏览器服务实例
export const browserService = new BrowserService();
export const sessionManager = browserService; // 兼容性别名

export default browserService;
