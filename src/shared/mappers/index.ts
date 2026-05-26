import type { User } from '../../models/user.model.js';
import type { Session } from '../../models/session/index.js';
import type { MachineInfo } from '@shared/types/index.js';
import type {
  UserResponseDTO,
  LoginUserDTO,
  CreateUserDTO,
  UserListItemDTO,
  UpdateUserDTO,
  CurrentUserDTO,
  SessionDetailDTO,
  CreateSessionResponseDTO,
  MachineMemoryDTO,
  SessionReleaseDTO,
} from '../types/dto.js';

function toISO(v: Date | string | null | undefined): string | null {
  if (v === undefined) return null;
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export function toLoginUser(user: User): LoginUserDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    credits: user.credits,
  };
}

export function toCreateUserResponse(user: User): CreateUserDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    credits: user.credits,
    api_key: user.api_key,
    webhook_url: user.webhook_url,
  };
}

export function toUserListItem(user: User): UserListItemDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    credits: user.credits,
    api_key: user.api_key ?? '',
    created_at: toISO(user.created_at) || '',
  };
}

export function toUpdateUserResponse(user: User): UpdateUserDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    credits: user.credits,
    webhook_url: user.webhook_url,
  };
}

export function toCurrentUserResponse(user: User): CurrentUserDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    credits: user.credits,
    webhook_url: user.webhook_url,
    api_key: user.api_key,
    created_at: toISO(user.created_at) || '',
  };
}

export function toUserResponse(user: User): UserResponseDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    credits: user.credits,
    api_key: user.api_key,
    webhook_url: user.webhook_url,
    created_at: toISO(user.created_at) || '',
  };
}

export function toSessionDetail(session: Session): SessionDetailDTO {
  return {
    id: session.id,
    status: session.status,
    machine_id: session.machine_id ?? null,
    port: session.port ?? null,
    options: session.options ? (session.options as unknown as Record<string, unknown>) : null,
    start_time: toISO(session.start_time) as string | Date,
    end_time: toISO(session.end_time) as string | Date,
    disconnected_at: toISO(session.disconnected_at) as string | Date,
    duration: session.duration,
    credits_used: session.credits_used,
    screenshot_url: session.screenshot_url ?? null,
    last_activity: toISO(session.last_activity) as string | Date,
    error_message: session.error_message ?? null,
    created_at: toISO(session.created_at) as string | Date,
    updated_at: toISO(session.updated_at) as string | Date,
  };
}

export function serializeSessionTimestamps(session: Session): Record<string, unknown> {
  return {
    ...session,
    start_time: toISO(session.start_time),
    end_time: toISO(session.end_time),
    disconnected_at: toISO(session.disconnected_at),
    last_activity: toISO(session.last_activity),
    created_at: toISO(session.created_at),
    updated_at: toISO(session.updated_at),
  };
}

export function toCreateSessionResponse(
  sessionId: string,
  status: string,
  directUrl: string,
  viewerUrl: string,
  createdAt: Date | string | null | undefined
): CreateSessionResponseDTO {
  return {
    id: sessionId,
    status,
    browserWSEndpoint: directUrl,
    directUrl,
    viewerUrl,
    created_at: toISO(createdAt),
  };
}

interface MemoryMachine {
  machine_id: string;
  name: string;
  ip: string;
  grpc_port: number;
  proxy_port: number;
  cpu_usage: number;
  memory_usage: number;
  disk_space: number;
  active_sessions: number;
  max_sessions: number;
  online: boolean;
  last_heartbeat: Date;
}

export function toMachineMemoryDTO(machine: MemoryMachine): MachineMemoryDTO {
  return {
    id: machine.machine_id,
    hostname: machine.name,
    ip: machine.ip,
    grpcPort: machine.grpc_port,
    proxyPort: machine.proxy_port,
    cpuUsage: machine.cpu_usage,
    memoryUsage: machine.memory_usage,
    diskUsage: machine.disk_space,
    instanceCount: machine.active_sessions,
    maxInstances: machine.max_sessions,
    status: machine.online ? 'online' : 'offline',
    lastSeen: machine.last_heartbeat,
  };
}

export function toMachineInfoDTO(machine: MachineInfo): MachineMemoryDTO {
  return {
    id: machine.id,
    hostname: machine.hostname,
    ip: machine.ip,
    grpcPort: machine.grpcPort ?? 0,
    proxyPort: machine.proxyPort ?? 0,
    cpuUsage: machine.cpuUsage,
    memoryUsage: machine.memoryUsage,
    diskUsage: machine.diskUsage,
    instanceCount: machine.instanceCount,
    maxInstances: machine.maxInstances,
    status: machine.status,
    lastSeen: machine.lastSeen,
  };
}

export function toSessionReleaseDTO(sessionId: string, status: string, duration: number): SessionReleaseDTO {
  return {
    id: sessionId,
    status,
    duration,
  };
}
