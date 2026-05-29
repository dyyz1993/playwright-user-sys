import * as stream from 'stream';

const REASON_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  410: 'Gone',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export function rejectUpgrade(socket: stream.Duplex, statusCode: number, message?: string): void {
  const phrase = REASON_PHRASES[statusCode] || 'Unknown';
  try {
    if (!socket.destroyed && socket.writable) {
      socket.write(`HTTP/1.1 ${statusCode} ${phrase}\r\n\r\n${message || ''}`);
    }
  } catch {
    // ignore socket write errors
  }
  socket.destroy();
}
