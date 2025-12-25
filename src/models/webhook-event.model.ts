import { db } from '../config/database.js';
import { WebhookEventType, PaginationQuery, PaginatedResponse } from '@shared/types/index.js';

export interface WebhookEvent {
  id: number;
  user_id: number;
  event_type: WebhookEventType;
  payload: any;
  delivered: boolean;
  attempts: number;
  last_attempt: Date | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWebhookEventInput {
  user_id: number;
  event_type: WebhookEventType;
  payload: any;
}

export class WebhookEventModel {
  // 创建 Webhook 事件
  static async create(data: CreateWebhookEventInput): Promise<WebhookEvent> {
    const [id] = await db('webhook_events').insert({
      user_id: data.user_id,
      event_type: data.event_type,
      payload: JSON.stringify(data.payload),
      delivered: false,
      attempts: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });
    
    return this.findById(id);
  }
  
  // 通过 ID 查找 Webhook 事件
  static async findById(id: number): Promise<WebhookEvent | null> {
    const event = await db('webhook_events').where({ id }).first();
    if (!event) return null;
    
    return {
      ...event,
      payload: JSON.parse(event.payload),
    };
  }
  
  // 标记 Webhook 事件已发送
  static async markDelivered(id: number): Promise<WebhookEvent | null> {
    await db('webhook_events').where({ id }).update({
      delivered: true,
      attempts: db.raw('attempts + 1'),
      last_attempt: new Date(),
      updated_at: new Date(),
    });
    
    return this.findById(id);
  }
  
  // 标记 Webhook 事件发送失败
  static async markFailed(id: number, error: string): Promise<WebhookEvent | null> {
    await db('webhook_events').where({ id }).update({
      delivered: false,
      attempts: db.raw('attempts + 1'),
      last_attempt: new Date(),
      error,
      updated_at: new Date(),
    });
    
    return this.findById(id);
  }
  
  // 获取用户的所有 Webhook 事件（分页）
  static async findByUserId(userId: number, query: PaginationQuery = {}): Promise<PaginatedResponse<WebhookEvent>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const sort = query.sort || 'created_at';
    const order = query.order || 'desc';
    
    const [events, total] = await Promise.all([
      db('webhook_events')
        .where({ user_id: userId })
        .orderBy(sort, order)
        .limit(limit)
        .offset(offset),
      db('webhook_events').where({ user_id: userId }).count('id as count').first(),
    ]);
    
    return {
      items: events.map(event => ({
        ...event,
        payload: JSON.parse(event.payload),
      })),
      total: total ? Number(total.count) : 0,
      page,
      limit,
      totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
    };
  }
  
  // 获取所有未发送的 Webhook 事件
  static async findPending(limit: number = 10): Promise<WebhookEvent[]> {
    const events = await db('webhook_events')
      .where({ delivered: false })
      .where('attempts', '<', 3)
      .orderBy('created_at')
      .limit(limit);
    
    return events.map(event => ({
      ...event,
      payload: JSON.parse(event.payload),
    }));
  }
  
  // 获取所有 Webhook 事件（分页）
  static async findAll(query: PaginationQuery = {}): Promise<PaginatedResponse<WebhookEvent>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const sort = query.sort || 'created_at';
    const order = query.order || 'desc';
    
    const [events, total] = await Promise.all([
      db('webhook_events')
        .orderBy(sort, order)
        .limit(limit)
        .offset(offset),
      db('webhook_events').count('id as count').first(),
    ]);
    
    return {
      items: events.map(event => ({
        ...event,
        payload: JSON.parse(event.payload),
      })),
      total: total ? Number(total.count) : 0,
      page,
      limit,
      totalPages: Math.ceil((total ? Number(total.count) : 0) / limit),
    };
  }
}

export default WebhookEventModel;
