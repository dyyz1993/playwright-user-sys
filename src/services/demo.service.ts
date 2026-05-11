import { SessionStatus } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
import { createBrowserSession, releaseSession } from './session.service.js';
import { SessionModel } from '../models/session/index.js';
import { UserModel } from '../models/user.model.js';
import { db } from '../config/database.js';
import { hashPassword } from '../utils/auth.js';
import { v4 as uuidv4 } from 'uuid';

const DEMO_USER_USERNAME = 'demo_user';
const DEMO_SESSION_TIMEOUT = parseInt(process.env.DEMO_SESSION_TIMEOUT || '300', 10);
const DEMO_MAX_SESSIONS = parseInt(process.env.DEMO_MAX_SESSIONS || '10', 10);

interface DemoSessionTracker {
  sessionId: string;
  ip: string;
  createdAt: Date;
  expiresAt: Date;
  timeoutHandle: ReturnType<typeof setTimeout>;
  lastActivity: Date;
}

export class DemoService {
  private activeSessions = new Map<string, DemoSessionTracker>();
  private ipSessions = new Map<string, string>();
  private demoUserId: number | null = null;
  private demoApiKey: string | null = null;
  private _initialized = false;

  get initialized(): boolean {
    return this._initialized;
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
        logger.info(`Demo 用户已创建: id=${user!.id}`);
      }

      this.demoUserId = user!.id;
      this.demoApiKey = user!.api_key;
      this._initialized = true;
      logger.info(`Demo 服务已初始化: userId=${this.demoUserId}`);

      await this.cleanupStaleSessions();
    } catch (error) {
      logger.error('Demo 服务初始化失败:', error);
    }
  }

  async createSession(ip: string): Promise<{ sessionId: string; expiresAt: Date; maxDuration: number }> {
    if (process.env.DEMO_ENABLED === 'false') {
      throw new Error('Demo 功能已禁用');
    }

    const existingSessionId = this.ipSessions.get(ip);
    if (existingSessionId) {
      const tracker = this.activeSessions.get(existingSessionId);
      if (tracker && tracker.expiresAt > new Date()) {
        throw new Error('您已有一个进行中的体验会话');
      }
      this.ipSessions.delete(ip);
      this.activeSessions.delete(existingSessionId);
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
    const expiresAt = new Date(now.getTime() + DEMO_SESSION_TIMEOUT * 1000);

    const timeoutHandle = setTimeout(() => {
      this.releaseSession(session.sessionId).catch((err) => {
        logger.warn(`Demo 会话超时释放失败: ${session.sessionId}`, err);
      });
    }, DEMO_SESSION_TIMEOUT * 1000);

    const tracker: DemoSessionTracker = {
      sessionId: session.sessionId,
      ip,
      createdAt: now,
      expiresAt,
      timeoutHandle,
      lastActivity: now,
    };
    this.activeSessions.set(session.sessionId, tracker);
    this.ipSessions.set(ip, session.sessionId);

    logger.info(`Demo 会话已创建: ${session.sessionId}, IP: ${ip}, 超时: ${DEMO_SESSION_TIMEOUT}s`);
    return { sessionId: session.sessionId, expiresAt, maxDuration: DEMO_SESSION_TIMEOUT };
  }

  async releaseSession(sessionId: string): Promise<void> {
    const tracker = this.activeSessions.get(sessionId);
    if (tracker) {
      clearTimeout(tracker.timeoutHandle);
      this.ipSessions.delete(tracker.ip);
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
    } catch (error) {
      logger.warn(`Demo 会话释放失败: ${sessionId}`, error);
    }
  }

  getSessionStatus(sessionId: string): { status: string; remainingSeconds: number } | null {
    const tracker = this.activeSessions.get(sessionId);
    if (!tracker) return null;

    const remaining = Math.max(0, Math.floor((tracker.expiresAt.getTime() - Date.now()) / 1000));
    return {
      status: tracker.expiresAt > new Date() ? 'active' : 'expired',
      remainingSeconds: remaining,
    };
  }

  refreshActivity(sessionId: string): boolean {
    const tracker = this.activeSessions.get(sessionId);
    if (!tracker || tracker.expiresAt <= new Date()) return false;
    tracker.lastActivity = new Date();
    return true;
  }

  private async cleanupStaleSessions(): Promise<void> {
    try {
      const sessions = await SessionModel.findActiveSessions();
      const demoSessions = sessions.filter((s) => s.user_id === this.demoUserId);
      for (const s of demoSessions) {
        logger.info(`清理残留 demo 会话: ${s.id}`);
        await this.releaseSession(s.id).catch(() => {});
      }
    } catch (error) {
      logger.warn('清理残留 demo 会话失败:', error);
    }
  }

  get demoUserApiKey(): string | null {
    return this.demoApiKey;
  }
}
