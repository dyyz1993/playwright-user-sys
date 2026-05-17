import fetch from 'node-fetch';
import { SessionCreateOptions, SessionStatus } from '@shared/types/index.js';
import type { SessionInfo } from './types.js';
import { Session } from './session.js';

export { Session } from './session.js';
export type { UploadFileOptions, UploadUrlOptions, UploadResult, SessionInfo } from './types.js';

/**
 * 会话数据接口（API 返回的原始数据）
 */
export interface SessionData {
  id: string;
  status: SessionStatus;
  machine_id?: string;
  port?: number;
  options?: SessionCreateOptions;
  start_time?: string;
  end_time?: string;
  duration?: number;
  screenshot_url?: string;
  created_at: string;
  updated_at?: string;
  browserWSEndpoint?: string;
  directUrl?: string;
}

/**
 * 分页响应接口
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Playwright 用户管理系统客户端
 */
export class Client {
  private apiKey: string;
  private baseUrl: string;

  /**
   * 创建客户端实例
   */
  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'http://localhost:3000';

    // 创建会话管理器
    this.sessions = new SessionManager(this);
  }

  /**
   * 会话管理器
   */
  public sessions: SessionManager;

  /**
   * 发送 API 请求
   * @param method HTTP方法
   * @param path API路径
   * @param body 请求体
   * @returns 响应数据
   */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ success: boolean; data: T; message?: string }> {
    const url = `${this.baseUrl}${path}`;

    const options: { method: string; headers: Record<string, string>; body?: string } = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let errorMessage = `API 请求失败: ${response.status} ${response.statusText}`;

      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Intentionally empty — use default errorMessage if response body is not JSON
      }

      throw new Error(errorMessage);
    }

    return response.json();
  }
}

/**
 * 会话管理器
 */
export class SessionManager {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * 创建会话
   * @param options 会话创建选项
   * @returns 创建的会话信息
   */
  async create(options?: SessionCreateOptions): Promise<SessionData> {
    const response = await this.client.request<SessionData>('POST', '/api/sessions', options);
    return response.data;
  }

  /**
   * 创建会话并返回 Session 实例（支持文件上传等操作）
   */
  async createAndConnect(options?: SessionCreateOptions): Promise<Session> {
    const data = await this.create(options);
    return new Session(this.client['baseUrl'], this.client['apiKey'], data as unknown as SessionInfo);
  }

  /**
   * 获取会话信息
   */
  async get(sessionId: string): Promise<SessionData> {
    const response = await this.client.request<SessionData>('GET', `/api/sessions/${sessionId}`);
    return response.data;
  }

  /**
   * 获取所有会话
   */
  async list(page: number = 1, limit: number = 10): Promise<SessionData[]> {
    const response = await this.client.request<SessionData[]>('GET', `/api/sessions?page=${page}&limit=${limit}`);
    return response.data;
  }

  /**
   * 释放会话
   * @param sessionId 会话ID
   * @returns 释放结果
   */
  async release(sessionId: string): Promise<{ id: string; status: SessionStatus; duration?: number }> {
    const response = await this.client.request<{ id: string; status: SessionStatus; duration?: number }>(
      'POST',
      `/api/sessions/${sessionId}/release`
    );
    return response.data;
  }

  /**
   * 获取会话的截图
   * @param sessionId 会话ID
   * @returns 截图 URL
   */
  async getScreenshot(sessionId: string): Promise<{ screenshot_url: string }> {
    const response = await this.client.request<{ screenshot_url: string }>(
      'GET',
      `/api/sessions/${sessionId}/screenshot`
    );
    return response.data;
  }
}

export default Client;
