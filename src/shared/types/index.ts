import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';

// 扩展 FastifyRequest 类型
declare module 'fastify' {
  interface FastifyInstance {
    verifyJWT: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    verifyAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    verifyApiKey: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user?: {
      id: number;
      username: string;
      role: 'admin' | 'user';
    };
  }
}


// 扩展 Fastify 请求类型
export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: number;
    username: string;
    role: 'admin' | 'user';
  };
}

// 扩展 Fastify 请求类型带参数
export interface AuthenticatedRequestWithParams<T> extends FastifyRequest<RouteGenericInterface & { Params: T }> {
  user: {
    id: number;
    username: string;
    role: 'admin' | 'user';
  };
}

// 用户角色
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

// 用户状态
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

// 实例状态
export enum InstanceStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  ERROR = 'error',
  OFFLINE = 'offline',
}

// 会话状态
export enum SessionStatus {
  CREATED = 'created',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  EXPIRED = 'expired',
  ERROR = 'error',
  COMPLETED = 'completed',
}

// 基础响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 分页请求参数
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// 分页响应
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 类型化的 Fastify 处理函数
export type TypedHandler<T = any, U = any> = (
  request: FastifyRequest<RouteGenericInterface & { Body: T }>,
  reply: FastifyReply
) => Promise<ApiResponse<U>>;

// 会话创建参数
export interface SessionCreateOptions {
  userAgent?: string;
  proxy?: string;
  cookies?: Record<string, string>;
  localStorage?: Record<string, string>;
  viewport?: {
    width: number;
    height: number;
  };
  // 存储状态相关
  storageStatePath?: string;
  storageState?: {
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>;
    origins?: Array<{
      origin: string;
      localStorage: Array<{ name: string; value: string }>;
    }>;
  };
  // 共享用户数据目录
  // 当 sharedUserData 为 true 时，所有会话共享同一个用户数据目录
  // 当 sharedUserData 为 false 或未设置时，每个会话有独立的用户数据目录
  sharedUserData?: boolean;
  // 浏览器时区设置
  timezone?: string;
  // @deprecated 出于安全考虑，不再允许客户端指定任意路径
  userDataDir?: string;
}

// 实例机器信息
export interface MachineInfo {
  id: string;
  hostname: string;
  ip: string;
  grpcPort?: number;
  proxyPort?: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  instanceCount: number;
  maxInstances: number;
  status: 'online' | 'offline' | 'busy';
  lastSeen: Date;
}

// 机器实时状态
export interface MachineStatus {
  machine_id: string;
  name: string;
  ip: string;
  grpc_port: number;
  cpu_usage: number;
  memory_usage: number;
  disk_space: number;
  active_sessions: number;
  max_sessions: number;
  last_heartbeat: Date;
}



// Webhook 事件类型
export enum WebhookEventType {
  SESSION_CREATED = 'session.created',
  SESSION_CONNECTED = 'session.connected',
  SESSION_DISCONNECTED = 'session.disconnected',
  SESSION_EXPIRED = 'session.expired',
  SESSION_ERROR = 'session.error',
  CREDITS_LOW = 'credits.low',
  CREDITS_DEPLETED = 'credits.depleted',
}

// Webhook 事件数据
export interface WebhookEvent<T = any> {
  type: WebhookEventType;
  timestamp: string;
  data: T;
}

// 路由参数类型
export interface IdParams {
  id: string;
}
