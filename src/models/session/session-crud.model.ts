import { db } from '../../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { SessionStatus } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
import type { Session, CreateSessionInput, UpdateSessionInput, Knex } from './types.js';

export const crudMethods = {
  async create(data: CreateSessionInput): Promise<Session | null> {
    const sessionId = uuidv4();

    let optionsJson: string | null = null;
    if (data.options) {
      try {
        optionsJson = JSON.stringify(data.options);
        JSON.parse(optionsJson!);
      } catch (error: unknown) {
        logger.error('Invalid session options JSON:', error);
        throw new Error('Invalid options format: must be valid JSON');
      }
    }

    await db('sessions').insert({
      id: sessionId,
      user_id: data.user_id,
      machine_id: data.machine_id || null,
      port: data.port || null,
      status: SessionStatus.CREATED,
      options: optionsJson,
      start_time: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return this.findById(sessionId);
  },

  async findById(id: string): Promise<Session | null> {
    try {
      const session = await db('sessions').where({ id }).first();
      if (!session) return null;

      let parsedOptions = null;
      if (session.options) {
        try {
          if (typeof session.options === 'string') {
            parsedOptions = JSON.parse(session.options);
          } else {
            parsedOptions = session.options;
          }
        } catch (error: unknown) {
          logger.error(`解析会话选项失败 (ID: ${id}):`, error);
          parsedOptions = null;
        }
      }

      return {
        ...session,
        options: parsedOptions,
        start_time: session.start_time ? new Date(session.start_time) : null,
        end_time: session.end_time ? new Date(session.end_time) : null,
        disconnected_at: session.disconnected_at ? new Date(session.disconnected_at) : null,
        last_activity: session.last_activity ? new Date(session.last_activity) : null,
        created_at: session.created_at ? new Date(session.created_at) : new Date(),
        updated_at: session.updated_at ? new Date(session.updated_at) : new Date(),
      };
    } catch (error: unknown) {
      logger.error(`查找会话失败 (ID: ${id}):`, error);
      throw error;
    }
  },

  async update(id: string, data: UpdateSessionInput): Promise<Session | null> {
    const updateData: Record<string, unknown> = {
      ...data,
      updated_at: new Date(),
    };

    await db('sessions').where({ id }).update(updateData);
    return this.findById(id);
  },

  async batchUpdate(
    updates: Array<{ id: string; duration: number; credits_used: number }>,
    trx?: Knex.Transaction
  ): Promise<number> {
    try {
      let count = 0;
      const queryBuilder = trx || db;

      for (const update of updates) {
        await queryBuilder('sessions').where('id', update.id).update({
          duration: update.duration,
          credits_used: update.credits_used,
          updated_at: new Date(),
        });
        count++;
      }

      return count;
    } catch (error: unknown) {
      logger.error('批量更新会话失败:', error);
      throw error;
    }
  },

  async updateLastActivity(id: string): Promise<Session | null> {
    await db('sessions').where({ id }).update({
      last_activity: new Date(),
      updated_at: new Date(),
    });

    return this.findById(id);
  },

  async getDetailById(id: string): Promise<
    | (Session & {
        username: string;
        machine_name?: string;
      })
    | null
  > {
    try {
      const session = await db('sessions')
        .select('sessions.*', 'users.username', 'machines.hostname as machine_name')
        .leftJoin('users', 'sessions.user_id', 'users.id')
        .leftJoin('machines', 'sessions.machine_id', 'machines.id')
        .where('sessions.id', id)
        .first();

      if (!session) return null;

      let parsedOptions = null;
      if (session.options) {
        try {
          if (typeof session.options === 'string') {
            parsedOptions = JSON.parse(session.options);
          } else {
            parsedOptions = session.options;
          }
        } catch (error: unknown) {
          logger.error(`解析会话选项失败 (ID: ${id}):`, error);
          parsedOptions = null;
        }
      }

      return {
        ...session,
        options: parsedOptions,
      };
    } catch (error: unknown) {
      logger.error('获取会话详情失败:', error);
      return null;
    }
  },
};
