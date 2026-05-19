import { Page, Browser } from 'puppeteer-core';
import { EventEmitter } from 'events';
import { logger } from '@shared/utils/logger.js';
import type { SessionConfig, BrowserLaunchOptions, BrowserInstance, SessionInfo } from './types.js';
import { takeScreenshot as takeScreenshotFn } from './session_handlers/screenshot.js';
import {
  updateSessionActivity as updateSessionActivityFn,
  handleConnection as handleConnectionFn,
  updateActivity as updateActivityFn,
  handleDisconnection as handleDisconnectionFn,
  startActivityReporting as startActivityReportingFn,
  stopActivityReporting as stopActivityReportingFn,
} from './browser-connection.js';
import {
  launchBrowser as launchBrowserFn,
  closeBrowser as closeBrowserFn,
  closeAllBrowsers as closeAllBrowsersFn,
} from './browser-lifecycle.js';
import type { LifecycleState } from './browser-lifecycle.js';

export type { SessionConfig, BrowserOptions, BrowserLaunchOptions, BrowserInstance } from './types.js';

export class BrowserService extends EventEmitter {
  private static instance: BrowserService | null = null;
  private sessions: Map<string, SessionInfo> = new Map();
  private connections: Map<string, import('./types.js').ConnectionInfo> = new Map();
  private disconnectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private activityReportInterval: NodeJS.Timeout | null = null;
  private userSharedBrowsers: Map<number, string> = new Map();

  private constructor() {
    super();
    this.activityReportInterval = startActivityReportingFn(this.getState(), (sessionId) =>
      this.handleDisconnection(sessionId)
    );
  }

  static getInstance(): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService();
    }
    return BrowserService.instance;
  }

  private getState(): LifecycleState {
    return {
      sessions: this.sessions,
      connections: this.connections,
      disconnectionTimers: this.disconnectionTimers,
      userSharedBrowsers: this.userSharedBrowsers,
      emit: this.emit.bind(this),
      takeScreenshot: (sessionId: string) => this.takeScreenshot(sessionId),
      closeBrowser: (sessionId: string) => this.closeBrowser(sessionId),
    };
  }

  // ===== Lifecycle =====

  async launchBrowser(sessionId: string, options: BrowserLaunchOptions = {}): Promise<BrowserInstance> {
    return launchBrowserFn(this.getState(), sessionId, options);
  }

  async closeBrowser(sessionId: string): Promise<boolean> {
    return closeBrowserFn(this.getState(), sessionId);
  }

  async closeAllBrowsers(): Promise<void> {
    return closeAllBrowsersFn(
      this.getState(),
      (sid) => this.closeBrowser(sid),
      () => this.stopActivityReporting()
    );
  }

  // ===== Connection =====

  updateSessionActivity(sessionId: string) {
    updateSessionActivityFn(this.getState(), sessionId);
  }

  handleConnection(sessionId: string): void {
    handleConnectionFn(this.getState(), sessionId);
  }

  updateActivity(sessionId: string): void {
    updateActivityFn(this.getState(), sessionId);
  }

  handleDisconnection(sessionId: string): void {
    handleDisconnectionFn(this.getState(), sessionId, (sid) => this.closeBrowser(sid));
  }

  stopActivityReporting() {
    this.activityReportInterval = stopActivityReportingFn(this.activityReportInterval);
  }

  // ===== Screenshot =====

  async takeScreenshot(sessionId: string): Promise<string | undefined> {
    return takeScreenshotFn(this, sessionId, (screenshotUrl) => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.screenshotUrl = screenshotUrl;
      }
    });
  }

  // ===== Session Query =====

  getPort(sessionId: string): number | null {
    return this.sessions.get(sessionId)?.port ?? null;
  }

  getPath(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.path ?? null;
  }

  getActiveSessions(): number {
    return this.sessions.size;
  }

  getBrowserWSEndpoint(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.wsEndpoint ?? null;
  }

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
    } catch (error: unknown) {
      logger.error(`获取页面失败 (sessionId: ${sessionId}):`, error);
      await this.closeBrowser(sessionId);
      return null;
    }
  }

  getSessionConfig(sessionId: string): SessionConfig | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session.config } : null;
  }

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

  getSessionBrowser(sessionId: string): Browser | undefined {
    return this.sessions.get(sessionId)?.browser;
  }

  getTransformedCoordinates(sessionId: string, x: number, y: number): { tx: number; ty: number } | null {
    const config = this.getSessionConfig(sessionId);
    if (!config) return null;
    if (config.clip) {
      return { tx: config.clip.x + x, ty: config.clip.y + y };
    }
    return { tx: x, ty: y };
  }

  // ===== Session Manager Public API =====

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  setSession(sessionId: string, ctx: SessionInfo): void {
    this.sessions.set(sessionId, ctx);
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  sessionKeys(): string[] {
    return Array.from(this.sessions.keys());
  }

  sessionValues(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  forEachSession(callback: (ctx: SessionInfo, id: string) => void): void {
    this.sessions.forEach((ctx, id) => callback(ctx, id));
  }

  getSessionStartTime(sessionId: string): number | undefined {
    return this.sessions.get(sessionId)?.startTime;
  }
}

export const browserService = BrowserService.getInstance();
export const sessionManager = browserService;

export default browserService;
