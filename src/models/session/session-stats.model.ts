import { db } from '../../config/database.js';
import { SessionRow } from '@shared/types/tables.js';
import { logger } from '@shared/utils/logger.js';
import type { Session } from './types.js';

export const statsMethods = {
  async getUserSessionStats(
    userId: number
  ): Promise<{ total_sessions: number; total_duration: number; total_credits_used: number }> {
    try {
      logger.info(`开始查询用户 ${userId} 的会话消耗统计`);

      const totalResult = await db('sessions').where({ user_id: userId }).count('id as count').first();
      const total_sessions = totalResult ? Number(totalResult.count) : 0;

      const durationResult = await db('sessions').where({ user_id: userId }).sum('duration as total').first();
      const total_duration = durationResult && durationResult.total ? Number(durationResult.total) : 0;

      const creditsResult = await db('sessions').where({ user_id: userId }).sum('credits_used as total').first();
      const total_credits_used = creditsResult && creditsResult.total ? Number(creditsResult.total) : 0;

      logger.info(
        `用户 ${userId} 的会话统计: 总会话数=${total_sessions}, 总时长=${total_duration}秒, 总消耗点数=${total_credits_used}点`
      );

      return {
        total_sessions,
        total_duration,
        total_credits_used,
      };
    } catch (error) {
      logger.error(`获取用户会话统计失败 (userId: ${userId}):`, error);
      return {
        total_sessions: 0,
        total_duration: 0,
        total_credits_used: 0,
      };
    }
  },

  async countActiveByUserId(userId: number): Promise<number> {
    try {
      const { SessionStatus } = await import('@shared/types/index.js');
      const result = await db('sessions')
        .where({ user_id: userId })
        .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED])
        .count('id as count')
        .first();
      return result ? Number(result.count) : 0;
    } catch (error) {
      logger.error(`统计用户活跃会话失败 (userId: ${userId}):`, error);
      return 0;
    }
  },

  async countActiveSessions(): Promise<number> {
    try {
      const { SessionStatus } = await import('@shared/types/index.js');
      const result = await db('sessions')
        .whereIn('status', [SessionStatus.CREATED, SessionStatus.CONNECTED])
        .count('id as count')
        .first();
      return result ? Number(result.count) : 0;
    } catch (error) {
      logger.error('统计活跃会话数失败:', error);
      return 0;
    }
  },

  async sumUsedCredits(): Promise<number> {
    try {
      const result = await db('sessions').sum('credits_used as total').first();
      return result && result.total ? Number(result.total) : 0;
    } catch (error) {
      logger.error('计算已使用点数失败:', error);
      return 0;
    }
  },

  async getStats(filters?: { startDate?: Date; endDate?: Date }): Promise<{
    total: number;
    active: number;
    ended: number;
    error: number;
    totalCreditsUsed: number;
    totalDuration: number;
    avgDuration: number;
    byUser: Array<{
      user_id: number;
      username: string;
      sessionCount: number;
      creditsUsed: number;
    }>;
  }> {
    try {
      let query = db('sessions')
        .select('sessions.*', 'users.username')
        .leftJoin('users', 'sessions.user_id', 'users.id');

      if (filters?.startDate) {
        query = query.where('sessions.created_at', '>=', filters.startDate);
      }

      if (filters?.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.where('sessions.created_at', '<=', endDate);
      }

      const sessions = await query;

      const total = sessions.length;
      const active = sessions.filter((s: SessionRow & { username?: string }) =>
        ['created', 'connected'].includes(s.status)
      ).length;
      const ended = sessions.filter((s: SessionRow & { username?: string }) =>
        ['disconnected', 'expired', 'completed'].includes(s.status)
      ).length;
      const error = sessions.filter((s: SessionRow & { username?: string }) => s.status === 'error').length;

      const totalCreditsUsed = sessions.reduce(
        (sum: number, s: SessionRow & { username?: string }) => sum + (s.credits_used || 0),
        0
      );
      const totalDuration = sessions.reduce(
        (sum: number, s: SessionRow & { username?: string }) => sum + (s.duration || 0),
        0
      );
      const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;

      const byUserMap = new Map();
      sessions.forEach((s: SessionRow & { username?: string }) => {
        const userId = s.user_id;
        if (!byUserMap.has(userId)) {
          byUserMap.set(userId, {
            user_id: userId,
            username: s.username,
            sessionCount: 0,
            creditsUsed: 0,
          });
        }
        const user = byUserMap.get(userId);
        user.sessionCount++;
        user.creditsUsed += s.credits_used || 0;
      });

      return {
        total,
        active,
        ended,
        error,
        totalCreditsUsed,
        totalDuration,
        avgDuration,
        byUser: Array.from(byUserMap.values()),
      };
    } catch (error) {
      logger.error('获取会话统计失败:', error);
      return {
        total: 0,
        active: 0,
        ended: 0,
        error: 0,
        totalCreditsUsed: 0,
        totalDuration: 0,
        avgDuration: 0,
        byUser: [],
      };
    }
  },
};
