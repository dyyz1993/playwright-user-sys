import { SessionModel } from '../models/session/index.js';
import { MachineModel } from '../models/machine.model.js';
import { UserModel } from '../models/user.model.js';
import { SessionStatus, WebhookEventType } from '@shared/types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { connectionManager } from './machine-grpc/index.js';

export interface BatchReleaseResult {
  released: string[];
  failed: Array<{ sessionId: string; error: string }>;
}

export async function batchReleaseSessions(sessionIds: string[]): Promise<BatchReleaseResult> {
  const released: string[] = [];
  const failed: Array<{ sessionId: string; error: string }> = [];

  for (const sessionId of sessionIds) {
    try {
      const session = await SessionModel.findById(sessionId);
      if (!session) {
        failed.push({ sessionId, error: '会话不存在' });
        continue;
      }

      if (session.status === SessionStatus.DISCONNECTED || session.status === SessionStatus.ERROR) {
        released.push(sessionId);
        continue;
      }

      if (!session.machine_id) {
        const now = new Date();
        const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
        const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

        await SessionModel.markDisconnected(sessionId, duration);

        released.push(sessionId);
        continue;
      }

      try {
        await connectionManager.closeBrowser(session.machine_id, sessionId);

        const now = new Date();
        const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
        const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

        await SessionModel.markDisconnected(sessionId, duration);

        await MachineModel.decrementInstanceCount(session.machine_id);

        await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
          session_id: sessionId,
          disconnected_at: new Date(),
        });

        released.push(sessionId);
      } catch (_machineError: unknown) {
        const now = new Date();
        const startTime = session.start_time ? new Date(session.start_time) : new Date(session.created_at);
        const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        await SessionModel.markDisconnected(sessionId, duration);

        released.push(sessionId);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '结束失败';
      failed.push({ sessionId, error: message });
    }
  }

  return { released, failed };
}

export async function getUserSessions(userId: number, options: { page: string; limit: string }) {
  const sessions = await SessionModel.findByUserId(userId, options);
  return sessions;
}

export async function findUserById(userId: number) {
  return UserModel.findById(userId);
}

export async function listSessions(query: {
  page: string;
  limit: string;
  sort: string;
  order: string;
  status?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  dateRange?: string;
}) {
  const page = parseInt(query.page || '1');
  const limit = parseInt(query.limit || '20');
  const sort = query.sort || 'created_at';
  const order = (query.order || 'desc') as 'asc' | 'desc';

  const filters: { status?: string; userId?: number; startDate?: Date; endDate?: Date } = {};

  if (query.status) {
    filters.status = query.status;
  }

  if (query.userId) {
    filters.userId = parseInt(query.userId);
  }

  if (query.dateRange && query.dateRange !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (query.dateRange === 'today') {
      filters.startDate = today;
    } else if (query.dateRange === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      filters.startDate = yesterday;
      filters.endDate = yesterday;
    } else if (query.dateRange === 'week') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      filters.startDate = startOfWeek;
    } else if (query.dateRange === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      filters.startDate = startOfMonth;
    }
  }

  if (query.startDate) {
    filters.startDate = new Date(query.startDate);
  }
  if (query.endDate) {
    filters.endDate = new Date(query.endDate);
  }

  const result = await SessionModel.paginateSorted(page, limit, {
    sort,
    order,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  });

  return result;
}

export async function getSessionStats(query: { startDate?: string; endDate?: string; dateRange?: string }) {
  const filters: { startDate?: Date; endDate?: Date } = {};

  if (query.dateRange && query.dateRange !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (query.dateRange === 'today') {
      filters.startDate = today;
    } else if (query.dateRange === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      filters.startDate = yesterday;
      filters.endDate = yesterday;
    } else if (query.dateRange === 'week') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      filters.startDate = startOfWeek;
    } else if (query.dateRange === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      filters.startDate = startOfMonth;
    }
  }

  if (query.startDate) {
    filters.startDate = new Date(query.startDate);
  }
  if (query.endDate) {
    filters.endDate = new Date(query.endDate);
  }

  const stats = await SessionModel.getStats(Object.keys(filters).length > 0 ? filters : undefined);
  return stats;
}

export async function getSessionDetail(sessionId: string) {
  return SessionModel.getDetailById(sessionId);
}

export async function refreshSessionStatus(sessionIds?: string[]): Promise<Array<{ id: string; status: string }>> {
  let sessions: Array<{ id: string; status: string }> = [];

  if (sessionIds && sessionIds.length > 0) {
    for (const sessionId of sessionIds) {
      const session = await SessionModel.findById(sessionId);
      if (session) {
        sessions.push({ id: session.id, status: session.status });
      }
    }
  } else {
    sessions = await SessionModel.findActiveSessions();
    sessions = sessions.map((s) => ({ id: s.id, status: s.status }));
  }

  return sessions;
}
