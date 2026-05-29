import { SessionStatus } from '@shared/types/index.js';

export interface MachineRealTimeStatus {
  machine_id: string;
  name: string;
  ip: string;
  grpc_port: number;
  proxy_port: number;
  online: boolean;
  cpu_usage: number;
  memory_usage: number;
  disk_space: number;
  active_sessions: number;
  max_sessions: number;
  last_heartbeat: Date;
}

export interface SessionRealTimeStatus {
  id: string;
  user_id: number;
  machine_id: string;
  status: SessionStatus;
  start_time: Date;
  last_activity: Date;
  browser_ws_endpoint?: string | undefined;
  port?: number | undefined;
}
