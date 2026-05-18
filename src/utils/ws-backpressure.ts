import { WebSocket, Data } from 'ws';

export const MAX_WS_BUFFER_SIZE = 1024 * 1024;

export function safeSend(ws: WebSocket, data: Data, options?: { binary?: boolean }): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount >= MAX_WS_BUFFER_SIZE) return false;
  ws.send(data, options ?? {});
  return true;
}

export function safeSendWithCallback(
  ws: WebSocket,
  data: Data,
  options: { binary?: boolean },
  callback: (err?: Error) => void
): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount >= MAX_WS_BUFFER_SIZE) return false;
  ws.send(data, options, callback);
  return true;
}
