import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '@shared/utils/logger.js';
import { browserService } from './browser.service.js';
import { CONFIG } from './config.js';

const startTime = Date.now();

let server: http.Server | null = null;
let grpcConnected: boolean = false;

export function setGrpcConnected(connected: boolean): void {
  grpcConnected = connected;
}

function buildHealthResponse() {
  const memUsage = process.memoryUsage();
  return {
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    activeSessions: browserService.getActiveSessions(),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    grpcConnected: grpcConnected,
  };
}

export function startHealthServer(port?: number): void {
  const healthPort = port || parseInt(process.env.MACHINE_HEALTH_PORT || '9100', 10);

  if (server) {
    logger.warn(`Health server already running on port ${healthPort}`);
    return;
  }

  server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      const body = buildHealthResponse();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    } else if (req.url?.startsWith('/screenshots/') && req.method === 'GET') {
      try {
        const filename = path.basename(req.url);
        const filePath = path.join(CONFIG.dataDir, 'screenshots', filename);
        const normalized = path.normalize(filePath);
        const screenshotsDir = path.normalize(path.join(CONFIG.dataDir, 'screenshots'));
        if (!normalized.startsWith(screenshotsDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        const data = await fs.readFile(filePath);
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': data.length });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not Found');
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Health server port ${healthPort} is already in use`);
    } else {
      logger.error('Health server error:', err);
    }
  });

  server.listen(healthPort, '127.0.0.1', () => {
    logger.info(`Health server listening on 127.0.0.1:${healthPort}`);
  });
}

export async function stopHealthServer(): Promise<void> {
  if (!server) return;
  const serverToClose = server;
  return new Promise((resolve) => {
    serverToClose.close(() => {
      server = null;
      logger.info('Health server stopped');
      resolve();
    });
  });
}
