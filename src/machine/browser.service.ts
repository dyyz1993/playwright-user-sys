import puppeteer from 'puppeteer-core';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FingerprintInjector } from "fingerprint-injector";
import { BrowserFingerprintWithHeaders, FingerprintGenerator } from "fingerprint-generator";
import { CONFIG } from './config.js';
import { logger } from '../utils/logger.js';

// 浏览器选项接口
export interface BrowserOptions {
  userAgent?: string;
  proxy?: string;
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
}

// 浏览器实例接口
export interface BrowserInstance {
  browserWSEndpoint: string;
  port: number;
  path: string;
  screenshotUrl?: string;
}

// 会话信息接口
interface SessionInfo {
  port: number;
  browser: puppeteer.Browser;
  path: string;
  lastActivity: number;
  startTime: number;
  screenshotUrl?: string;
  fingerprint?: BrowserFingerprintWithHeaders; // 存储指纹数据
}

// 连接信息接口
interface ConnectionInfo {
  connectedAt: number;
  lastActivity: number;
  totalConnectedTime: number;
}

/**
 * 浏览器服务类
 * 负责管理浏览器实例的创建、关闭和监控
 */
class BrowserService extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private connections: Map<string, ConnectionInfo> = new Map();
  private disconnectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private activityReportInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    // 启动活动报告
    this.startActivityReporting();
  }

  /**
   * 启动活动报告
   */
  private startActivityReporting() {
    // 每隔一段时间报告一次会话活动（默认3秒）
    this.activityReportInterval = setInterval(() => {
      const now = Date.now();

      for (const [sessionId, connection] of this.connections.entries()) {
        // 只报告活跃连接（没有断开连接计时器的连接）
        if (!this.disconnectionTimers.has(sessionId)) {
          // 检查上次活动时间，如果超过超时时间，则视为断开连接
          if (now - connection.lastActivity > CONFIG.sessionActivityTimeout) {
            logger.warn(`会话活动超时 (sessionId: ${sessionId}, 上次活动: ${new Date(connection.lastActivity).toISOString()})`);
            // 处理断开连接
            this.handleDisconnection(sessionId);
          } else {
            // 发送活动报告
            this.emit('sessionActivity', sessionId, connection.totalConnectedTime);
            logger.debug(`发送会话活动报告 (sessionId: ${sessionId}, 总连接时长: ${connection.totalConnectedTime}秒)`);
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
      logger.warn(`会话不存在 (sessionId: ${sessionId})`);
      return;
    }

    // 清除断开连接计时器（如果存在）
    if (this.disconnectionTimers.has(sessionId)) {
      clearTimeout(this.disconnectionTimers.get(sessionId)!);
      this.disconnectionTimers.delete(sessionId);
      logger.info(`已清除断开连接计时器 (sessionId: ${sessionId})`);
    }

    // 计算之前的总连接时长
    const previousTotalTime = this.connections.has(sessionId)
      ? this.connections.get(sessionId)!.totalConnectedTime
      : 0;

    // 记录连接信息
    this.connections.set(sessionId, {
      connectedAt: now,
      lastActivity: now,
      totalConnectedTime: previousTotalTime
    });

    // 发送连接事件
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
      clearTimeout(this.disconnectionTimers.get(sessionId)!);
      this.disconnectionTimers.delete(sessionId);
      logger.info(`已清除断开连接计时器 (sessionId: ${sessionId})`);
    }
    const connection = this.connections.get(sessionId);
    if (!connection) {
      logger.warn(`找不到连接信息 (sessionId: ${sessionId})`);

      // 即使没有连接信息，也应该设置断开连接计时器
      logger.info(`设置断开连接计时器 (sessionId: ${sessionId}, 超时时间: ${CONFIG.disconnectionTimeout}ms)`);
      const timer = setTimeout(() => {
        logger.info(`会话连接超时，准备关闭浏览器 (sessionId: ${sessionId})`);
        this.closeBrowser(sessionId)
          .then(success => {
            if (success) {
              logger.info(`已关闭超时会话的浏览器 (sessionId: ${sessionId})`);
            } else {
              logger.error(`关闭超时会话的浏览器失败 (sessionId: ${sessionId})`);
            }
          })
          .catch(error => {
            logger.error(`关闭超时会话的浏览器出错 (sessionId: ${sessionId}):`, error);
          });
      }, CONFIG.disconnectionTimeout);

      this.disconnectionTimers.set(sessionId, timer);
      return;
    }

    const now = Date.now();

    // 计算本次连接时长（秒）
    const connectionDuration = Math.floor((now - connection.connectedAt) / 1000);

    // 更新总连接时长
    connection.totalConnectedTime += connectionDuration;

    // 发送断开连接事件
    this.emit('sessionDisconnected', sessionId, connection.totalConnectedTime);

    logger.info(`用户已断开会话连接 (sessionId: ${sessionId}, 本次连接时长: ${connectionDuration}秒, 总连接时长: ${connection.totalConnectedTime}秒)`);

    // 设置断开连接计时器（如果一定时间内没有重新连接，则关闭浏览器实例）
    logger.info(`设置断开连接计时器 (sessionId: ${sessionId}, 超时时间: ${CONFIG.disconnectionTimeout}ms)`);
    const timer = setTimeout(() => {
      logger.info(`会话连接超时，准备关闭浏览器 (sessionId: ${sessionId})`);
      this.closeBrowser(sessionId)
        .then(success => {
          if (success) {
            logger.info(`已关闭超时会话的浏览器 (sessionId: ${sessionId})`);
          } else {
            logger.error(`关闭超时会话的浏览器失败 (sessionId: ${sessionId})`);
          }
        })
        .catch(error => {
          logger.error(`关闭超时会话的浏览器出错 (sessionId: ${sessionId}):`, error);
        });
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
        browsers: options.fingerprintOptions?.browsers || ['chrome', 'firefox', 'safari']
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
  async launchBrowser(sessionId: string, options: BrowserOptions = {}): Promise<BrowserInstance> {
    try {
      // 启动浏览器
      logger.info(`开始启动浏览器 (sessionId: ${sessionId})`);

      // 设置超时时间
      const timeout = 120000; // 2 分钟

      // 生成浏览器指纹
      // 默认启用指纹注入，除非明确指定不启用
      if (!options.fingerprintOptions) {
        options.fingerprintOptions = {
          enabled: true,
          devices: ['desktop'],
          operatingSystems: ['windows', 'macos', 'linux'],
          browsers: ['chrome', 'firefox', 'safari']
        };
        logger.info('使用默认指纹选项');
      }

      const fingerprint = this.generateFingerprint(options);

      // 如果有指纹并且指纹包含用户代理，使用指纹的用户代理
      if (fingerprint && !options.userAgent) {
        options.userAgent = fingerprint.fingerprint.navigator.userAgent;
        logger.info(`使用指纹的用户代理: ${options.userAgent}`);
      }

      // 转换选项
      const puppeteerOptions = this.convertPuppeteerOptions(options);

      // 创建一个 Promise 并设置超时
      const browserPromise = new Promise<puppeteer.Browser>(async (resolve, reject) => {
        try {
          const browser = await puppeteer.launch(puppeteerOptions);
          resolve(browser);
        } catch (error) {
          reject(error);
        }
      });

      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`启动浏览器超时 (${timeout}ms)`));
        }, timeout);
      });

      // 使用 Promise.race 来实现超时
      const browser = await Promise.race([browserPromise, timeoutPromise]);

      // 如果有指纹，设置事件监听来注入指纹
      if (fingerprint) {
        try {
          // 存储指纹数据到会话信息中，以便后续使用
          const sessionInfo = this.sessions.get(sessionId);
          if (sessionInfo) {
            sessionInfo.fingerprint = fingerprint;
          }

          // 设置浏览器事件监听，以便在新页面创建时注入指纹
          browser.on('targetcreated', this.createTargetHandler(sessionId, fingerprint));
          // browser.on('targetchanged', this.createTargetChangeHandler(sessionId, fingerprint));
          browser.on('disconnected', this.createDisconnectHandler(sessionId));

          logger.info(`已设置浏览器指纹事件监听 (sessionId: ${sessionId})`);
          logger.info(`指纹将在用户创建页面时自动注入 (sessionId: ${sessionId})`);
        } catch (error) {
          logger.error(`设置指纹事件监听失败 (sessionId: ${sessionId}):`, error);
          // 即使设置失败，也继续使用浏览器
        }
      }

      // 获取 WebSocket 端点
      const browserWSEndpoint = browser.wsEndpoint();
      logger.info(`浏览器 WebSocket 端点: ${browserWSEndpoint}`);


      // 从 WebSocket 端点提取端口和路径
      const wsUrl = new URL(browserWSEndpoint);
      const port = parseInt(wsUrl.port, 10);
      const path = wsUrl.pathname;

      const now = Date.now();

      // 存储会话信息
      this.sessions.set(sessionId, {
        port,
        browser,
        path,
        lastActivity: now,
        startTime: now
      });

      logger.info(`浏览器已启动 (sessionId: ${sessionId}, port: ${port}, path: ${path})`);

      // 截取屏幕截图
      const screenshotUrl = await this.takeScreenshot(sessionId, browser);

      return { browserWSEndpoint, port, path, screenshotUrl };
    } catch (error) {
      logger.error(`启动浏览器失败 (sessionId: ${sessionId}):`, error);
      throw error;
    }
  }

  /**
   * 关闭浏览器实例
   */
  async closeBrowser(sessionId: string): Promise<boolean> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        logger.warn(`会话不存在 (sessionId: ${sessionId})`);
        return false;
      }

      // 获取连接信息
      const connection = this.connections.get(sessionId);
      let totalConnectedTime = connection ? connection.totalConnectedTime : 0;

      // 如果没有连接信息，根据会话的开始时间计算持续时间
      if (totalConnectedTime === 0 && session.startTime) {
        const now = Date.now();
        totalConnectedTime = Math.floor((now - session.startTime) / 1000);
        logger.info(`根据会话开始时间计算持续时间 (sessionId: ${sessionId}): 开始时间=${new Date(session.startTime).toISOString()}, 当前时间=${new Date(now).toISOString()}, 持续时间=${totalConnectedTime}秒`);
      }

      // 关闭浏览器
      await session.browser.close();

      // 清理会话数据
      this.sessions.delete(sessionId);
      this.connections.delete(sessionId);

      // 清除断开连接计时器（如果存在）
      if (this.disconnectionTimers.has(sessionId)) {
        clearTimeout(this.disconnectionTimers.get(sessionId)!);
        this.disconnectionTimers.delete(sessionId);
      }

      // 发送会话关闭事件
      this.emit('sessionClosed', sessionId, totalConnectedTime);

      logger.info(`浏览器已关闭 (sessionId: ${sessionId}, 总连接时长: ${totalConnectedTime}秒)`);
      return true;
    } catch (error) {
      logger.error(`关闭浏览器失败 (sessionId: ${sessionId}):`, error);
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
  convertPuppeteerOptions(options: BrowserOptions = {}): any {
    // 将选项转换为 puppeteer-core 选项
    const result: any = {
      args: ['--no-sandbox', '--disable-setuid-sandbox',

        "--remote-allow-origins=*",
        "--disable-dev-shm-usage",
        '--disable-responsive-ui',
        '--force-device-scale-factor=1',
        "--disable-gpu",
        '--disable-web-security',
        "--disable-setuid-sandbox",
        "--use-angle=disabled",
        "--disable-blink-features=AutomationControlled",
        "--webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--force-webrtc-ip-handling-policy",
        "--timezone=Asia/Shanghai"
      ],
      headless: options.headless !== undefined ? options.headless : false,
      executablePath: CONFIG.chromePath
    };

    if (options.args && Array.isArray(options.args)) {
      result.args.push(...options.args);
    }

    if (options.userAgent) {
      result.args.push(`--user-agent=${options.userAgent}`);
    }

    if (options.proxy) {
      result.args.push(`--proxy-server=${options.proxy}`);
    }

    if(options.viewport){
      result.args.push(`--window-size=${options.viewport.width},${options.viewport.height}`);
    }
    if(options.timezone){
      result.args.push(`--timezone=${options.timezone}`);
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

    return result;
  }

  /**
   * 创建目标创建处理函数
   */
  private createTargetHandler(sessionId: string, fingerprint: BrowserFingerprintWithHeaders) {
    return async (target: puppeteer.Target) => {
      try {
        // 只处理页面类型的目标
        if (target.type() !== 'page') return;

        // 等待页面创建完成
        const page = await target.page();
        if (!page) return;

        // 创建指纹注入器
        const fingerprintInjector = new FingerprintInjector();

        // 注入指纹
        await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);
        logger.info(`成功注入指纹到新页面 (sessionId: ${sessionId}, url: ${page.url()})`);

        // 尝试为页面创建截图
        this.capturePageScreenshot(sessionId, page);
      } catch (error) {
        logger.error(`注入指纹到新页面失败 (sessionId: ${sessionId}):`, error);
      }
    };
  }

  /**
   * 创建目标变化处理函数
   */
  private createTargetChangeHandler(sessionId: string, fingerprint: BrowserFingerprintWithHeaders) {
    return async (target: puppeteer.Target) => {
      try {
        // 只处理页面类型的目标
        if (target.type() !== 'page') return;

        // 等待页面创建完成
        const page = await target.page();
        if (!page) return;

        // 创建指纹注入器
        const fingerprintInjector = new FingerprintInjector();

        // 注入指纹
        await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);
        logger.info(`成功注入指纹到变化页面 (sessionId: ${sessionId}, url: ${page.url()})`);
      } catch (error) {
        logger.error(`注入指纹到变化页面失败 (sessionId: ${sessionId}):`, error);
      }
    };
  }

  /**
   * 创建断开连接处理函数
   */
  private createDisconnectHandler(sessionId: string) {
    return () => {
      logger.info(`浏览器实例已断开连接 (sessionId: ${sessionId})`);

      // 先调用 handleDisconnection 方法，确保用户断开连接的逻辑被正确处理
      this.handleDisconnection(sessionId);

      // 然后直接关闭浏览器，不等待超时
      logger.info(`浏览器实例断开连接，直接关闭浏览器 (sessionId: ${sessionId})`);
      this.closeBrowser(sessionId)
        .then(success => {
          if (success) {
            logger.info(`已关闭断开连接的浏览器 (sessionId: ${sessionId})`);
          } else {
            logger.error(`关闭断开连接的浏览器失败 (sessionId: ${sessionId})`);
          }
        })
        .catch(error => {
          logger.error(`关闭断开连接的浏览器出错 (sessionId: ${sessionId}):`, error);
        });
    };
  }

  /**
   * 为页面创建截图
   */
  private async capturePageScreenshot(sessionId: string, page: puppeteer.Page): Promise<void> {
    try {
      // 获取会话信息
      const session = this.sessions.get(sessionId);
      if (!session) {
        logger.warn(`无法为页面创建截图，会话不存在 (sessionId: ${sessionId})`);
        return;
      }

      // 创建截图目录
      const screenshotDir = path.join(CONFIG.dataDir, 'screenshots');
      await fs.mkdir(screenshotDir, { recursive: true });

      // 生成截图文件名
      const filename = `${sessionId}-${uuidv4()}.png`;
      const screenshotPath = path.join(screenshotDir, filename);

      // 截取屏幕截图
      await page.screenshot({ path: screenshotPath });

      // 构建截图 URL
      const screenshotUrl = `/screenshots/${filename}`;

      // 更新会话信息
      session.screenshotUrl = screenshotUrl;

      // 发送截图事件
      this.emit('sessionScreenshot', sessionId, screenshotUrl);

      logger.info(`已为会话 ${sessionId} 创建页面截图: ${screenshotUrl}`);
    } catch (error) {
      logger.error(`为页面创建截图失败 (sessionId: ${sessionId}):`, error);
    }
  }

  /**
   * 截取浏览器屏幕截图
   * 注意：我们不使用 newPage 方法，而是等待用户创建页面
   * 因此这里只生成一个默认的截图 URL
   */
  async takeScreenshot(sessionId: string, _browser: puppeteer.Browser): Promise<string | undefined> {
    try {
      // 创建截图目录
      const screenshotDir = path.join(CONFIG.dataDir, 'screenshots');
      await fs.mkdir(screenshotDir, { recursive: true });

      // 生成截图文件名
      const filename = `${sessionId}-${uuidv4()}.png`;
      // 构建截图路径（仅用于日志）
      const screenshotPath = path.join(screenshotDir, filename);
      logger.info(`预留截图路径: ${screenshotPath}`);

      // 构建截图 URL
      const screenshotUrl = `/screenshots/${filename}`;

      // 更新会话信息
      const session = this.sessions.get(sessionId);
      if (session) {
        session.screenshotUrl = screenshotUrl;
      }

      // 发送截图事件
      this.emit('sessionScreenshot', sessionId, screenshotUrl);

      logger.info(`已为会话 ${sessionId} 创建默认截图 URL: ${screenshotUrl}`);
      logger.info(`实际截图将在用户创建页面时生成`);

      return screenshotUrl;
    } catch (error) {
      logger.error(`创建截图 URL 失败 (sessionId: ${sessionId}):`, error);
      return undefined;
    }
  }
}

// 创建浏览器服务实例
export const browserService = new BrowserService();
export const sessionManager = browserService; // 兼容性别名

export default browserService;
