import puppeteer, { Page, Browser, Frame, ScreenshotOptions } from 'puppeteer-core';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FingerprintInjector } from "fingerprint-injector";
import { BrowserFingerprintWithHeaders, FingerprintGenerator } from "fingerprint-generator";
import { CONFIG } from './config.js';
import { logger } from '../utils/logger.js';
import { Buffer } from 'buffer';

declare global {
    interface Window {
        _mouseTrackingInjected?: boolean;
        updateMousePosition?: (x: number, y: number, viewportWidth: number, viewportHeight: number) => void;
    }
}

// !! 更新：会话配置接口 !!
export interface SessionConfig {
  fps?: number;
  clip?: { x: number; y: number; width: number; height: number };
  interactionMode?: 'general_navigation' | 'captcha_slider' | 'form_input' | string;
  touchMode?: 'touchpad' | 'touch';
}

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

// 浏览器选项接口
export interface BrowserLaunchOptions extends BrowserOptions { // 重命名以区分
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

/**
 * 浏览器服务类 - 专注于核心浏览器管理和能力提供
 */
class BrowserService extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private connections: Map<string, ConnectionInfo> = new Map();
  private disconnectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private activityReportInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startActivityReporting();
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

    const previousTotalTime = this.connections.has(sessionId)
      ? this.connections.get(sessionId)!.totalConnectedTime
      : 0;

    this.connections.set(sessionId, {
      connectedAt: now,
      lastActivity: now,
      totalConnectedTime: previousTotalTime
    });
    // !! 移除 sessionConnected emit !!
    // this.emit('sessionConnected', sessionId);
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
      // this.emit('sessionDisconnected', sessionId, connection.totalConnectedTime);
      logger.info(`用户已断开会话连接 (sessionId: ${sessionId}, 本次连接时长: ${connectionDuration}秒, 总连接时长: ${connection.totalConnectedTime}秒)`);
    } else {
        logger.warn(`处理断开连接：找不到连接信息 (sessionId: ${sessionId})`);
    }
    logger.info(`设置断开连接计时器 (sessionId: ${sessionId}, 超时时间: ${CONFIG.disconnectionTimeout}ms)`);
    const timer = setTimeout(() => {
      logger.info(`会话连接超时，准备关闭浏览器 (sessionId: ${sessionId})`);
      this.closeBrowser(sessionId)
        .then(success => logger.info(`超时会话浏览器关闭 ${success ? '成功' : '失败'} (sessionId: ${sessionId})`))
        .catch(error => logger.error(`关闭超时会话浏览器出错 (sessionId: ${sessionId}):`, error));
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
  async launchBrowser(sessionId: string, options: BrowserLaunchOptions = {}): Promise<BrowserInstance> {
    try {
      logger.info(`开始启动浏览器 (sessionId: ${sessionId})`);
      const timeout = 120000;
      if (!options.fingerprintOptions) {
        options.fingerprintOptions = { enabled: true };
      }
      const fingerprint = this.generateFingerprint(options);
      if (fingerprint && !options.userAgent) {
        options.userAgent = fingerprint.fingerprint.navigator.userAgent;
      }
      const initialConfig: SessionConfig = { ...DEFAULT_SESSION_CONFIG, ...(options.sessionConfig || {}) };
      if (!initialConfig.touchMode) {
          initialConfig.touchMode = (initialConfig.interactionMode === 'captcha_slider' || initialConfig.interactionMode === 'touch') ? 'touch' : 'touchpad';
      }
      logger.info(`Initial session config for ${sessionId}: ${JSON.stringify(initialConfig)}`);
      const puppeteerOptions = this.convertPuppeteerOptions(options);
      const browserPromise = puppeteer.launch(puppeteerOptions);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`启动浏览器超时 (${timeout}ms)`)), timeout);
      });
      const browser = await Promise.race([browserPromise, timeoutPromise]);

      // 设置事件监听 (只保留必要的)
      if (fingerprint) {
        try {
          browser.on('targetcreated', this.createTargetHandler(sessionId, fingerprint));
          browser.on('disconnected', this.createDisconnectHandler(sessionId));
          logger.info(`已设置浏览器事件监听 (sessionId: ${sessionId})`);
        } catch (error) {
          logger.error(`设置指纹事件监听失败 (sessionId: ${sessionId}):`, error);
        }
      } else {
        browser.on('disconnected', this.createDisconnectHandler(sessionId));
      }

      const browserWSEndpoint = browser.wsEndpoint();
      const wsUrl = new URL(browserWSEndpoint);
      const port = parseInt(wsUrl.port, 10);
      const path = wsUrl.pathname;
      const now = Date.now();
      this.sessions.set(sessionId, {
        port, browser, path, lastActivity: now, startTime: now, wsEndpoint: browserWSEndpoint,
        config: initialConfig, fingerprint
      });
      logger.info(`浏览器已启动 (sessionId: ${sessionId}, port: ${port}, path: ${path})`);
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
      if(session && session.browser){
         try {
           // Attempt to close the browser if it exists and might be partially launched
           if (session.browser.process() != null) { // Check if the process was spawned
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
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`关闭浏览器：会话不存在 (sessionId: ${sessionId})`);
      return false;
    }
    try {
      const connection = this.connections.get(sessionId);
      let totalConnectedTime = connection ? connection.totalConnectedTime : 0;
      if (!connection && session.startTime) {
         totalConnectedTime = Math.floor((Date.now() - session.startTime) / 1000);
      }
      await session.browser.close();
      this.sessions.delete(sessionId);
      this.connections.delete(sessionId);
      if (this.disconnectionTimers.has(sessionId)) {
        clearTimeout(this.disconnectionTimers.get(sessionId)!);
        this.disconnectionTimers.delete(sessionId);
      }
      // !! 移除 sessionClosed emit !!
      // this.emit('sessionClosed', sessionId, totalConnectedTime);
      logger.info(`浏览器已关闭 (sessionId: ${sessionId}, 总连接时长: ${totalConnectedTime}秒)`);
      return true;
    } catch (error) {
      logger.error(`关闭浏览器失败 (sessionId: ${sessionId}):`, error);
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
   * 创建目标创建处理函数 (只注入指纹)
   */
  private createTargetHandler(sessionId: string, fingerprint: BrowserFingerprintWithHeaders) {
    return async (target: puppeteer.Target) => {
      try {
        if (target.type() !== 'page') return;
        const page = await target.page();
        if (!page || page.isClosed() || page.url().startsWith('devtools://')) return;
        logger.debug(`新页面目标创建，准备注入指纹 (sessionId: ${sessionId}, url: ${page.url()})`);
        const fingerprintInjector = new FingerprintInjector();
        await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);
        logger.info(`成功注入指纹到新页面 (sessionId: ${sessionId}, url: ${page.url()})`);
        // !! 移除页面监听器添加和截图逻辑 !!
      } catch (error) {
        logger.error(`处理新页面目标失败 (sessionId: ${sessionId}):`, error);
      }
    };
  }

  /**
   * 创建浏览器断开连接处理函数
   */
  private createDisconnectHandler(sessionId: string) {
    return () => {
      logger.warn(`浏览器实例已断开连接，将关闭会话 (sessionId: ${sessionId})`);
      this.closeBrowser(sessionId)
          .catch(error => logger.error(`关闭断开连接的浏览器时出错 (sessionId: ${sessionId}):`, error));
    };
  }

  /**
   * 截取浏览器屏幕截图 (生成初始 URL, 文件可能后续生成)
   */
  async takeScreenshot(sessionId: string): Promise<string | undefined> {
    try {
      const screenshotDir = path.join(CONFIG.dataDir, 'screenshots');
      await fs.mkdir(screenshotDir, { recursive: true });
      const filename = `${sessionId}-${uuidv4()}.jpeg`; // 使用 jpeg
      const screenshotUrl = `/screenshots/${filename}`;
      const session = this.sessions.get(sessionId);
      if (session) {
        session.screenshotUrl = screenshotUrl; // 更新 URL
      }
      // !! 移除 sessionScreenshot emit，这个应由请求者处理 !!
      // this.emit('sessionScreenshot', sessionId, screenshotUrl);
      logger.info(`预分配截图 URL (sessionId: ${sessionId}): ${screenshotUrl}`);
      return screenshotUrl;
    } catch (error) {
      logger.error(`创建截图 URL 失败 (sessionId: ${sessionId}):`, error);
      return undefined;
    }
  }

  /**
   * 核心截图方法，尊重 clip 配置
   */
  async captureScreenshot(sessionId: string): Promise<Buffer | null> {
      const page = await this.getSessionPage(sessionId);
      if (!page || page.isClosed()) {
          logger.warn(`无法截图: 页面无效 (sessionId: ${sessionId})`);
          return null;
      }
      const config = this.getSessionConfig(sessionId);
      if (!config) {
          logger.warn(`无法截图: 配置丢失 (sessionId: ${sessionId})`);
          return null;
      }
      try {
          const options: ScreenshotOptions = {
              type: 'jpeg',
              quality: 80,
              encoding: 'binary',
              clip: config.clip,
          };
          this.updateSessionActivity(sessionId);
          const screenshotBuffer: Buffer = await page.screenshot(options) as Buffer;
          return screenshotBuffer;
      } catch (error: any) {
          if (!page.isClosed()) {
            logger.error(`截图失败 (sessionId: ${sessionId}):`, error.message);
          }
          return null;
      }
  }

  /** 获取 WebSocket 端点 */
  getBrowserWSEndpoint(sessionId: string): string | null { return this.sessions.get(sessionId)?.wsEndpoint ?? null; }

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
        const mainPage = pages.find(p => !p.isClosed() && !p.url().startsWith('about:blank') && !p.url().startsWith('devtools://'));
        if (!mainPage && pages.length > 0) {
             return pages.find(p => !p.isClosed()) || null;
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
              currentConfig.touchMode = (currentConfig.interactionMode === 'captcha_slider' || currentConfig.interactionMode === 'touch') ? 'touch' : 'touchpad';
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
  getTransformedCoordinates(sessionId: string, x: number, y: number): { tx: number, ty: number } | null {
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




