import { Knex } from 'knex';
import { SessionCreateOptions, SessionStatus } from '@shared/types/index.js';
import { SessionRow } from '@shared/types/tables.js';

export interface Session extends Omit<
  SessionRow,
  'options' | 'start_time' | 'end_time' | 'disconnected_at' | 'last_activity' | 'created_at' | 'updated_at'
> {
  options: SessionCreateOptions | null;
  start_time: Date | null;
  end_time: Date | null;
  disconnected_at: Date | null;
  last_activity: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSessionInput {
  user_id: number;
  machine_id?: string;
  port?: number;
  options?: SessionCreateOptions;
}

export interface UpdateSessionInput {
  machine_id?: string;
  port?: number;
  status?: SessionStatus;
  start_time?: Date;
  end_time?: Date;
  disconnected_at?: Date;
  duration?: number;
  credits_used?: number;
  screenshot_url?: string;
  last_activity?: Date;
  error_message?: string;
}

export interface SessionFilterOptions {
  status?: string;
  userId?: number;
  startDate?: Date;
  endDate?: Date;
}

export function parseSessionOptions(raw: SessionRow & Record<string, unknown>): Session {
  try {
    return {
      ...raw,
      options: raw.options
        ? typeof raw.options === 'string'
          ? (JSON.parse(raw.options) as SessionCreateOptions)
          : (raw.options as SessionCreateOptions)
        : null,
    } as unknown as Session;
  } catch {
    return { ...raw, options: null } as unknown as Session;
  }
}

export function parseSessionRowWithDates(raw: SessionRow & Record<string, unknown>): Session {
  try {
    return {
      ...raw,
      options: raw.options
        ? typeof raw.options === 'string'
          ? (JSON.parse(raw.options) as SessionCreateOptions)
          : (raw.options as SessionCreateOptions)
        : null,
      start_time: raw.start_time ? new Date(raw.start_time) : null,
      end_time: raw.end_time ? new Date(raw.end_time) : null,
      disconnected_at: raw.disconnected_at ? new Date(raw.disconnected_at) : null,
      last_activity: raw.last_activity ? new Date(raw.last_activity) : null,
      created_at: raw.created_at ? new Date(raw.created_at) : new Date(),
      updated_at: raw.updated_at ? new Date(raw.updated_at) : new Date(),
    } as unknown as Session;
  } catch {
    return {
      ...raw,
      options: null,
      start_time: raw.start_time ? new Date(raw.start_time) : null,
      end_time: raw.end_time ? new Date(raw.end_time) : null,
      disconnected_at: raw.disconnected_at ? new Date(raw.disconnected_at) : null,
      last_activity: raw.last_activity ? new Date(raw.last_activity) : null,
      created_at: raw.created_at ? new Date(raw.created_at) : new Date(),
      updated_at: raw.updated_at ? new Date(raw.updated_at) : new Date(),
    } as unknown as Session;
  }
}

export type { Knex };
