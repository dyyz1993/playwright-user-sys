import * as stream from 'stream';
import * as http from 'http';
import * as net from 'net';
import jwt from 'jsonwebtoken';
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session/index.js';
import { logger } from '@shared/utils/logger.js';
import { memoryStore } from '../memory-store.service.js';
import { SessionStatus } from '@shared/types/index.js';
import { shortId, getJwtSecret, extractTokenFromHeaderOrCookie } from './utils.js';
import { rejectUpgrade } from './error-handler.js';

export async function handleViewerWebSocketProxy(
  request: http.IncomingMessage,
  socket: stream.Duplex,
  head: Buffer,
  sessionId: string,
  pathname: string
): Promise<void> {
  const connId = shortId();
  const cid = { connectionId: connId, sessionId };
  try {
    const parsedUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    const queryToken = parsedUrl.searchParams.get('token');

    const token: string | null = queryToken || extractTokenFromHeaderOrCookie(request);

    if (!token) {
      logger.error(`Viewer WebSocket代理缺少认证信息`, cid);
      rejectUpgrade(socket, 401, 'Missing authentication');
      return;
    }

    const jwtSecret = getJwtSecret();

    let decoded: { id: number; role: string };
    try {
      decoded = jwt.verify(token, jwtSecret) as { id: number; role: string };
    } catch {
      const userByKey = await UserModel.findByApiKey(token);
      if (!userByKey) {
        logger.error(`Viewer WebSocket代理认证失败`, cid);
        rejectUpgrade(socket, 401, 'Invalid token');
        return;
      }
      decoded = { id: userByKey.id, role: userByKey.role };
    }

    const user = await UserModel.findById(decoded.id);
    if (!user) {
      rejectUpgrade(socket, 401, 'User not found');
      return;
    }

    const session = await SessionModel.findById(sessionId);
    if (!session) {
      logger.error(`Viewer WebSocket代理：会话不存在`, cid);
      rejectUpgrade(socket, 404, 'Session not found');
      return;
    }

    if (session.status !== SessionStatus.CREATED && session.status !== SessionStatus.CONNECTED) {
      logger.error(`Viewer WebSocket代理：会话状态无效 (status: ${session.status})`, cid);
      rejectUpgrade(socket, 410, 'Session is not active');
      return;
    }

    if (session.user_id !== decoded.id && decoded.role !== 'admin') {
      logger.error(`Viewer WebSocket代理：无权访问会话 (userId: ${decoded.id})`, cid);
      rejectUpgrade(socket, 403, 'Access denied');
      return;
    }

    const machineId = session.machine_id;
    if (!machineId) {
      rejectUpgrade(socket, 500, 'No machine assigned');
      return;
    }

    const machineInfo = memoryStore.getMachine(machineId);
    if (!machineInfo) {
      rejectUpgrade(socket, 503, 'Machine not found');
      return;
    }

    const machineIp = machineInfo.ip;
    const proxyPort = machineInfo.proxy_port;
    const targetUrl = `ws://${machineIp}:${proxyPort}${pathname}?sessionId=${sessionId}`;

    logger.info(`Viewer WS Bridge: target=${targetUrl}`, cid);

    (request as { sessionId?: string }).sessionId = sessionId;

    const netSocket = net.connect(proxyPort, machineIp, () => {
      logger.info(`Viewer WS bridge TCP connected to ${machineIp}:${proxyPort}`, cid);

      const reqHeaders: string[] = [
        `${request.method} ${request.url} HTTP/1.1`,
        `Host: ${machineIp}:${proxyPort}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        `Sec-WebSocket-Key: ${request.headers['sec-websocket-key']}`,
        `Sec-WebSocket-Version: ${request.headers['sec-websocket-version'] || '13'}`,
      ];

      reqHeaders.push('\r\n');
      netSocket.write(reqHeaders.join('\r\n'));

      if (head && head.length > 0) {
        netSocket.write(head);
      }
    });

    let machineHeaderReceived = false;
    let bridged = false;

    function startBridging() {
      if (bridged) return;
      bridged = true;
      logger.info(`Viewer WS bridge active - piping raw bytes`, cid);

      socket.on('data', (chunk: Buffer) => {
        if (!netSocket.destroyed && netSocket.writable) {
          netSocket.write(chunk);
        }
      });
    }

    let machineRespBuffer = Buffer.alloc(0);
    netSocket.on('data', (chunk: Buffer) => {
      if (!machineHeaderReceived) {
        machineRespBuffer = Buffer.concat([machineRespBuffer, chunk]);
        const headerEnd = machineRespBuffer.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const headers = machineRespBuffer.slice(0, headerEnd).toString();
          const remaining = machineRespBuffer.slice(headerEnd + 4);

          logger.info(`Machine 101 response received: ${headers.split('\r\n')[0]}`, cid);

          const cleanHeaders = headers
            .split('\r\n')
            .filter((line) => !line.toLowerCase().startsWith('sec-websocket-extensions'))
            .join('\r\n');

          socket.write(Buffer.from(cleanHeaders + '\r\n\r\n'));
          machineHeaderReceived = true;

          if (remaining.length > 0) {
            socket.write(remaining);
          }

          startBridging();
        }
      } else if (machineHeaderReceived && !socket.destroyed && socket.writable) {
        socket.write(chunk);
      }
    });

    netSocket.on('error', (err: Error) => {
      logger.error(`Viewer WS TCP error:`, { ...cid, error: err.message });
      if (!socket.destroyed && socket.writable) {
        socket.end();
      }
    });

    netSocket.on('close', () => {
      logger.info(`Viewer WS machine TCP closed`, cid);
      if (!socket.destroyed && socket.writable) {
        socket.end();
      }
    });

    socket.on('close', () => {
      logger.info(`Viewer WebSocket连接关闭 (path: ${pathname})`, cid);
      netSocket.destroy();
    });

    socket.on('error', (err: Error) => {
      logger.error(`Viewer WebSocket连接错误:`, { ...cid, error: err.message });
      netSocket.destroy();
    });
  } catch (error: unknown) {
    logger.error(`Viewer WebSocket代理失败:`, { ...cid, error: (error as Error).message });
    rejectUpgrade(socket, 500);
  }
}
