import { UserRole, UserStatus, SessionStatus, WebhookEventType } from './index.js';

export interface UserRow {
  id: number;
  username: string;
  password: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  credits: number;
  api_key: string | null;
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: number;
  machine_id: string | null;
  port: number | null;
  status: SessionStatus;
  options: string | null;
  start_time: string | null;
  end_time: string | null;
  disconnected_at: string | null;
  duration: number;
  credits_used: number;
  screenshot_url: string | null;
  last_activity: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface MachineRow {
  id: string;
  hostname: string;
  ip: string;
  grpc_port: number | null;
  proxy_port: number | null;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  instance_count: number;
  max_instances: number;
  status: string;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export interface CreditHistoryRow {
  id: number;
  user_id: number;
  action: string;
  amount: number;
  balance_after: number;
  description: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperationLogRow {
  id: number;
  admin_id: number;
  action: string;
  details: string | null;
  target_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEventRow {
  id: number;
  user_id: number;
  event_type: WebhookEventType;
  payload: string;
  delivered: boolean;
  attempts: number;
  last_attempt: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestLogRow {
  id: number;
  user_id: number | null;
  method: string;
  path: string;
  status_code: number;
  ip: string | null;
  user_agent: string | null;
  response_time: number | null;
  created_at: string;
  updated_at: string;
}
