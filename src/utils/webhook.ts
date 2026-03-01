import fetch from 'node-fetch';
import { WebhookEventType } from '@shared/types/index.js';
import { WebhookEvent, WebhookEventModel } from '../models/webhook-event.model.js';
import { UserModel } from '../models/user.model.js';

// 创建 Webhook 事件
export async function createWebhookEvent(userId: number, eventType: WebhookEventType, payload: any): Promise<void> {
  const user = await UserModel.findById(userId);

  // 只有当用户配置了 webhook URL 时才创建事件
  if (user && user.webhook_url) {
    await WebhookEventModel.create({
      user_id: userId,
      event_type: eventType,
      payload,
    });
  }
}

// 发送 Webhook 事件
export async function sendWebhookEvent(event: WebhookEvent): Promise<boolean> {
  try {
    const user = await UserModel.findById(event.user_id);
    if (!user || !user.webhook_url) {
      return false;
    }

    const response = await fetch(user.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event.event_type,
      },
      body: JSON.stringify({
        type: event.event_type,
        timestamp: new Date().toISOString(),
        data: event.payload,
      }),
      timeout: 5000, // 5 秒超时
    });

    if (response.ok) {
      await WebhookEventModel.markDelivered(event.id);
      return true;
    } else {
      const errorText = await response.text();
      await WebhookEventModel.markFailed(event.id, `HTTP ${response.status}: ${errorText}`);
      return false;
    }
  } catch (error) {
    await WebhookEventModel.markFailed(event.id, error instanceof Error ? error.message : String(error));
    return false;
  }
}

// 处理待发送的 Webhook 事件
export async function processPendingWebhooks(limit: number = 10): Promise<number> {
  const pendingEvents = await WebhookEventModel.findPending(limit);
  let successCount = 0;

  for (const event of pendingEvents) {
    const success = await sendWebhookEvent(event);
    if (success) {
      successCount++;
    }
  }

  return successCount;
}

export default {
  createWebhookEvent,
  sendWebhookEvent,
  processPendingWebhooks,
};
