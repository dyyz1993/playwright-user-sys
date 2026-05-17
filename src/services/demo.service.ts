import { SessionStatus } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
import { createBrowserSession, releaseSession } from './session.service.js';
import { NotFoundError } from '../utils/errors.js';
import { SessionModel } from '../models/session/index.js';
import { UserModel } from '../models/user.model.js';
import { db } from '../config/database.js';
import { hashPassword } from '../utils/auth.js';
import { v4 as uuidv4 } from 'uuid';

const DEMO_USER_USERNAME = 'demo_user';
const DEMO_MAX_SESSIONS = parseInt(process.env.DEMO_MAX_SESSIONS || '20', 10);
const DEMO_IDLE_TIMEOUT = parseInt(process.env.DEMO_IDLE_TIMEOUT || '300', 10);
const DEMO_ABSOLUTE_TIMEOUT = 30 * 60 * 1000;

interface DemoSessionTracker {
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  absoluteTimeoutHandle: ReturnType<typeof setTimeout>;
  lastActivity: Date;
  creditsUsed: number;
}

export class DemoService {
  private activeSessions = new Map<string, DemoSessionTracker>();
  private demoUserId: number | null = null;
  private demoApiKey: string | null = null;
  private _initialized = false;
  private cleanupInterval: ReturnType<typeof setInterval>;

  get initialized(): boolean {
    return this._initialized;
  }

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupIdleSessions(), 60000);
  }

  async initialize(): Promise<void> {
    try {
      let user = await UserModel.findByUsername(DEMO_USER_USERNAME);
      if (!user) {
        const randomPassword = uuidv4();
        const hashedPassword = await hashPassword(randomPassword);
        const apiKey = uuidv4();

        await db('users').insert({
          username: DEMO_USER_USERNAME,
          password: hashedPassword,
          role: 'user',
          status: 'active',
          credits: 999999,
          api_key: apiKey,
          created_at: new Date(),
          updated_at: new Date(),
        });

        user = await UserModel.findByUsername(DEMO_USER_USERNAME);
        if (!user) {
          throw new NotFoundError('Demo用户');
        }
        logger.info(`Demo 用户已创建: id=${user.id}`);
      }

      if (!user) {
        throw new NotFoundError('Demo用户');
      }
      this.demoUserId = user.id;
      this.demoApiKey = user.api_key;
      this._initialized = true;
      logger.info(`Demo 服务已初始化: userId=${this.demoUserId}`);

      await this.cleanupStaleSessions();
    } catch (error: unknown) {
      logger.error('Demo 服务初始化失败:', error);
    }
  }

  async createSession(ip: string): Promise<{
    sessionId: string;
    demoApiKey: string;
    expiresAt: Date;
    maxDuration: number;
  }> {
    if (process.env.DEMO_ENABLED === 'false') {
      throw new Error('Demo 功能已禁用');
    }

    if (this.activeSessions.size >= DEMO_MAX_SESSIONS) {
      throw new Error('当前体验人数较多，请稍后再试');
    }

    if (!this.demoUserId) {
      throw new Error('Demo 服务未初始化');
    }

    const session = await createBrowserSession(
      this.demoUserId,
      {
        viewport: { width: 1280, height: 800 },
      },
      false,
      true
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEMO_ABSOLUTE_TIMEOUT);

    const absoluteTimeoutHandle = setTimeout(() => {
      logger.info(`Demo 会话绝对超时释放: ${session.sessionId}`);
      this.releaseSession(session.sessionId).catch((err) => {
        logger.warn(`Demo 会话超时释放失败: ${session.sessionId}`, err);
      });
    }, DEMO_ABSOLUTE_TIMEOUT);

    const tracker: DemoSessionTracker = {
      sessionId: session.sessionId,
      createdAt: now,
      expiresAt,
      absoluteTimeoutHandle,
      lastActivity: now,
      creditsUsed: 0,
    };
    this.activeSessions.set(session.sessionId, tracker);

    logger.info(`Demo 会话已创建: ${session.sessionId}, IP: ${ip}, 空闲超时: ${DEMO_IDLE_TIMEOUT}s`);
    return {
      sessionId: session.sessionId,
      demoApiKey: this.demoApiKey!,
      expiresAt,
      maxDuration: DEMO_IDLE_TIMEOUT,
    };
  }

  async releaseSession(sessionId: string): Promise<void> {
    const tracker = this.activeSessions.get(sessionId);
    if (tracker) {
      clearTimeout(tracker.absoluteTimeoutHandle);
      this.activeSessions.delete(sessionId);
    }

    try {
      const session = await SessionModel.findById(sessionId);
      if (session && (session.status === SessionStatus.CREATED || session.status === SessionStatus.CONNECTED)) {
        await releaseSession({
          sessionId,
          userId: this.demoUserId!,
          machineId: session.machine_id ?? undefined,
        });
        logger.info(`Demo 会话已释放: ${sessionId}`);
      }
    } catch (error: unknown) {
      logger.warn(`Demo 会话释放失败: ${sessionId}`, error);
    }
  }

  getSessionStatus(
    sessionId: string
  ): { status: string; remainingSeconds: number; creditsUsed: number; elapsedSeconds: number } | null {
    const tracker = this.activeSessions.get(sessionId);
    if (!tracker) return null;

    const elapsed = Math.floor((Date.now() - tracker.createdAt.getTime()) / 1000);
    const idleMs = Date.now() - tracker.lastActivity.getTime();
    const remaining = Math.max(0, DEMO_IDLE_TIMEOUT - Math.floor(idleMs / 1000));
    return {
      status: idleMs < DEMO_IDLE_TIMEOUT * 1000 ? 'active' : 'expired',
      remainingSeconds: remaining,
      creditsUsed: tracker.creditsUsed,
      elapsedSeconds: elapsed,
    };
  }

  refreshActivity(sessionId: string): boolean {
    const tracker = this.activeSessions.get(sessionId);
    if (!tracker) return false;
    const idleMs = Date.now() - tracker.lastActivity.getTime();
    if (idleMs > DEMO_IDLE_TIMEOUT * 1000) return false;
    tracker.lastActivity = new Date();
    return true;
  }

  addCreditsUsed(sessionId: string, credits: number): void {
    const tracker = this.activeSessions.get(sessionId);
    if (tracker) {
      tracker.creditsUsed += credits;
    }
  }

  getActiveCount(): number {
    return this.activeSessions.size;
  }

  getMaxSessions(): number {
    return DEMO_MAX_SESSIONS;
  }

  private async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    for (const [sessionId, tracker] of this.activeSessions) {
      const idleMs = now - tracker.lastActivity.getTime();
      if (idleMs > DEMO_IDLE_TIMEOUT * 1000) {
        logger.info(`Demo 会话空闲超时: ${sessionId}, 空闲 ${Math.floor(idleMs / 1000)}s`);
        await this.releaseSession(sessionId);
      }
    }
  }

  private async cleanupStaleSessions(): Promise<void> {
    try {
      const sessions = await SessionModel.findActiveSessions();
      const demoSessions = sessions.filter((s) => s.user_id === this.demoUserId);
      for (const s of demoSessions) {
        logger.info(`清理残留 demo 会话: ${s.id}`);
        await this.releaseSession(s.id).catch((err) =>
          logger.warn('Demo会话释放失败', { sessionId: s.id, error: (err as Error).message })
        );
      }
    } catch (error: unknown) {
      logger.warn('清理残留 demo 会话失败:', error);
    }
  }

  get demoUserApiKey(): string | null {
    return this.demoApiKey;
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
