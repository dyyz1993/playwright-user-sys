import type { UserDetail, UserListItem, SessionDetail } from '@schemas/index.js';

export type UserResponseDTO = UserDetail;

export interface LoginUserDTO {
  id: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  credits: number;
}

export interface CreateUserDTO {
  id: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  credits: number;
  api_key: string | null;
  webhook_url: string | null;
}

export type UserListItemDTO = UserListItem;

// Differs from schema: updateUserResponseSchema omits api_key, but DTO includes all fields
export interface UpdateUserDTO {
  id: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  credits: number;
  webhook_url: string | null;
}

// Differs from schema: currentUserResponseSchema omits status from userDetail
export interface CurrentUserDTO {
  id: number;
  username: string;
  email: string | null;
  role: string;
  credits: number;
  webhook_url: string | null;
  api_key: string | null;
  created_at: string;
}

export type SessionDetailDTO = SessionDetail;

export interface CreateSessionResponseDTO {
  id: string;
  status: string;
  browserWSEndpoint: string;
  directUrl: string;
  viewerUrl: string;
  created_at: string | null;
}

// Differs from machineDetailSchema: includes grpcPort/proxyPort which schema doesn't have
export interface MachineMemoryDTO {
  id: string;
  hostname: string;
  ip: string;
  grpcPort: number;
  proxyPort: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  instanceCount: number;
  maxInstances: number;
  status: string;
  lastSeen: Date;
}

export interface SessionReleaseDTO {
  id: string;
  status: string;
  duration: number;
}
