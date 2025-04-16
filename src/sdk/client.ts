import fetch from 'node-fetch';
import { SessionCreateOptions } from '../types/index.js';

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
   */
  async request(method: string, path: string, body?: any) {
    const url = `${this.baseUrl}${path}`;
    
    const options: any = {
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
      } catch (e) {
        // 忽略解析错误
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
   */
  async create(options?: SessionCreateOptions) {
    const response = await this.client.request('POST', '/api/sessions', options);
    return response.data;
  }
  
  /**
   * 获取会话信息
   */
  async get(sessionId: string) {
    const response = await this.client.request('GET', `/api/sessions/${sessionId}`);
    return response.data;
  }
  
  /**
   * 获取所有会话
   */
  async list(page: number = 1, limit: number = 10) {
    const response = await this.client.request('GET', `/api/sessions?page=${page}&limit=${limit}`);
    return response.data;
  }
  
  /**
   * 释放会话
   */
  async release(sessionId: string) {
    const response = await this.client.request('POST', `/api/sessions/${sessionId}/release`);
    return response.data;
  }
}

export default Client;
