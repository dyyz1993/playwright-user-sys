export interface UserResponseDTO {
  id: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  credits: number;
  api_key: string | null;
  webhook_url: string | null;
  created_at: string;
}

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

export interface UserListItemDTO {
  id: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  credits: number;
  created_at: string;
}

export interface UpdateUserDTO {
  id: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  credits: number;
  webhook_url: string | null;
}

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

export interface SessionDetailDTO {
  id: string;
  status: string;
  machine_id: string | null;
  port: number | null;
  options: Record<string, unknown> | null;
  start_time: string | null;
  end_time: string | null;
  disconnected_at: string | null;
  duration: number;
  credits_used: number;
  screenshot_url: string | null;
  last_activity: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateSessionResponseDTO {
  id: string;
  status: string;
  browserWSEndpoint: string;
  directUrl: string;
  viewerUrl: string;
  created_at: string | null;
}

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
