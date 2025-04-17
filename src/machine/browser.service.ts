import puppeteer from 'puppeteer-core';
import { EventEmitter } from 'events';
import { Duplex } from 'stream';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
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
}

// 连接信息接口
interface ConnectionInfo {
  socket: Duplex;
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
  handleConnection(sessionId: string, socket: Duplex): void {
    const now = Date.now();
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(`会话不存在 (sessionId: ${sessionId})`);
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
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
      socket,
      connectedAt: now,
      lastActivity: now,
      totalConnectedTime: previousTotalTime
    });

    // 发送连接事件
    this.emit('sessionConnected', sessionId);

    // 监听 socket 事件
    socket.on('message', () => this.handleActivity(sessionId));
    socket.on('close', () => this.handleDisconnection(sessionId));

    logger.info(`用户已连接到会话 (sessionId: ${sessionId})`);
  }

  /**
   * 处理用户活动
   */
  private handleActivity(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.lastActivity = Date.now();
    }
  }

  /**
   * 处理用户断开连接
   */
  private handleDisconnection(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (!connection) return;

    const now = Date.now();

    // 计算本次连接时长（秒）
    const connectionDuration = Math.floor((now - connection.connectedAt) / 1000);

    // 更新总连接时长
    connection.totalConnectedTime += connectionDuration;

    // 发送断开连接事件
    this.emit('sessionDisconnected', sessionId, connection.totalConnectedTime);

    logger.info(`用户已断开会话连接 (sessionId: ${sessionId}, 本次连接时长: ${connectionDuration}秒, 总连接时长: ${connection.totalConnectedTime}秒)`);

    // 设置断开连接计时器（如果一定时间内没有重新连接，则关闭浏览器实例）
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
   * 启动浏览器实例
   */
  async launchBrowser(sessionId: string, options: BrowserOptions = {}): Promise<BrowserInstance> {
    try {
      // 启动浏览器
      logger.info(`开始启动浏览器 (sessionId: ${sessionId})`);

      // 设置超时时间
      const timeout = 120000; // 2 分钟

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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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

    if (options.defaultViewport) {
      result.defaultViewport = options.defaultViewport;
    } else if (options.viewport) {
      result.defaultViewport = {
        width: options.viewport.width || 1280,
        height: options.viewport.height || 800,
      };
    } else {
      result.defaultViewport = {
        width: 1280,
        height: 800,
      };
    }

    return result;
  }

  /**
   * 截取浏览器屏幕截图
   */
  async takeScreenshot(sessionId: string, browser: puppeteer.Browser): Promise<string | undefined> {
    try {
      // 创建页面
      const page = await browser.newPage();

      // 导航到空白页
      await page.goto('about:blank');

      // 创建截图目录
      const screenshotDir = path.join(CONFIG.dataDir, 'screenshots');
      await fs.mkdir(screenshotDir, { recursive: true });

      // 生成截图文件名
      const filename = `${sessionId}-${uuidv4()}.png`;
      const screenshotPath = path.join(screenshotDir, filename);

      // 截取屏幕截图
      await page.screenshot({ path: screenshotPath });

      // 关闭页面
      await page.close();

      // 构建截图 URL
      const screenshotUrl = `/screenshots/${filename}`;

      // 更新会话信息
      const session = this.sessions.get(sessionId);
      if (session) {
        session.screenshotUrl = screenshotUrl;
      }

      // 发送截图事件
      this.emit('sessionScreenshot', sessionId, screenshotUrl);

      logger.info(`已为会话 ${sessionId} 创建截图: ${screenshotUrl}`);

      return screenshotUrl;
    } catch (error) {
      logger.error(`截取屏幕截图失败 (sessionId: ${sessionId}):`, error);
      return undefined;
    }
  }
}

// 创建浏览器服务实例
export const browserService = new BrowserService();
export const sessionManager = browserService; // 兼容性别名

export default browserService;
