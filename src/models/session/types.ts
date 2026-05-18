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

type SessionDbRow = SessionRow & Record<string, unknown>;

function parseOptionsField(raw: SessionDbRow): SessionCreateOptions | null {
  if (!raw.options) return null;
  if (typeof raw.options === 'string') {
    try {
      return JSON.parse(raw.options) as SessionCreateOptions;
    } catch {
      return null;
    }
  }
  return raw.options as SessionCreateOptions;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  return new Date(v as string | Date);
}

function toRequiredDate(v: unknown): Date {
  return v ? new Date(v as string | Date) : new Date();
}

export function parseSessionOptions(raw: SessionDbRow): Session {
  return {
    id: raw.id,
    user_id: raw.user_id,
    machine_id: raw.machine_id,
    port: raw.port,
    status: raw.status,
    options: parseOptionsField(raw),
    start_time: toDate(raw.start_time),
    end_time: toDate(raw.end_time),
    disconnected_at: toDate(raw.disconnected_at),
    duration: raw.duration,
    credits_used: raw.credits_used,
    screenshot_url: raw.screenshot_url,
    last_activity: toDate(raw.last_activity),
    error_message: raw.error_message,
    created_at: toRequiredDate(raw.created_at),
    updated_at: toRequiredDate(raw.updated_at),
  };
}

export function parseSessionRowWithDates(raw: SessionDbRow): Session {
  return {
    id: raw.id,
    user_id: raw.user_id,
    machine_id: raw.machine_id,
    port: raw.port,
    status: raw.status,
    options: parseOptionsField(raw),
    start_time: toDate(raw.start_time),
    end_time: toDate(raw.end_time),
    disconnected_at: toDate(raw.disconnected_at),
    duration: raw.duration,
    credits_used: raw.credits_used,
    screenshot_url: raw.screenshot_url,
    last_activity: toDate(raw.last_activity),
    error_message: raw.error_message,
    created_at: toRequiredDate(raw.created_at),
    updated_at: toRequiredDate(raw.updated_at),
  };
}

export type { Knex };
