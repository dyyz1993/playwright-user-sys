import { WebSocket } from 'ws';
import { SessionConfig } from '../browser.service.js';
import { logger } from '@shared/utils/logger.js';
import { safeSendWithCallback } from '../../utils/ws-backpressure.js';
import { WS_EVENT_SESSION_ENDED } from './ws-events.constants.js';

export function sendNotification(ws: WebSocket, eventType: string, data: Record<string, unknown> | null): void {
  if (ws.readyState === WebSocket.OPEN) {
    safeSendWithCallback(
      ws,
      JSON.stringify({
        type: eventType || 'notification',
        event: { type: eventType, ...data },
      }),
      {},
      (err) => {
        if (err) logger.error(`Failed to send notification (${eventType}):`, err);
      }
    );
  }
}

export function sendConfigSync(ws: WebSocket, config: SessionConfig): void {
  if (ws.readyState === WebSocket.OPEN) {
    safeSendWithCallback(ws, JSON.stringify({ type: 'configSync', config }), {}, (err) => {
      if (err) logger.error('Failed to send configSync:', err);
      else logger.info('Sent configSync:', config);
    });
  }
}

export function sendResponse(
  ws: WebSocket,
  requestType: string,
  data: { success: boolean; error?: string; [key: string]: unknown }
): void {
  if (ws.readyState === WebSocket.OPEN) {
    safeSendWithCallback(
      ws,
      JSON.stringify({
        type: 'response',
        requestType: requestType,
        data: data,
      }),
      {},
      (err) => {
        if (err) logger.error(`Failed to send response for ${requestType}:`, err);
      }
    );
  }
}

export function sendSessionEndedMessage(ws: WebSocket, reason: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    safeSendWithCallback(ws, JSON.stringify({ type: WS_EVENT_SESSION_ENDED, data: { reason } }), {}, (err) => {
      if (err) logger.error(`Failed to send ${WS_EVENT_SESSION_ENDED} message:`, err);
    });
  }
}
