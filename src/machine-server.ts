import { createServer } from 'http';
import httpProxy from 'http-proxy';
import { startGrpcClient, startGrpcServer } from './machine/grpc.service.js';
import { CONFIG } from './machine/config.js';
import { browserService } from './machine/browser.service.js';
import { logger } from './utils/logger.js';

// 创建 HTTP 代理服务器
const proxy = httpProxy.createProxyServer({
  ws: true,
  xfwd: true,
});

// 创建 HTTP 服务器
const server = createServer((req, res) => {
  // 解析 URL 中的 sessionId
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    res.writeHead(400);
    res.end('Missing sessionId parameter');
    return;
  }

  // 获取会话端口
  const port = browserService.getPort(sessionId);
  if (!port) {
    res.writeHead(404);
    res.end('Session not found');
    return;
  }

  // 转发请求
  const target = `http://localhost:${port}`;
  proxy.web(req, res, { target }, (err) => {
    logger.error('代理请求失败:', err);
    res.writeHead(500);
    res.end('Proxy error');
  });
});

// 处理 WebSocket 连接
server.on('upgrade', (req, socket, head) => {
  // 解析 URL 中的 sessionId
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  // 获取会话端口
  const port = browserService.getPort(sessionId);
  if (!port) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  // 将 WebSocket 对象传递给浏览器服务进行处理
  browserService.handleConnection(sessionId, socket);

  // 转发 WebSocket 连接
  const target = `ws://localhost:${port}`;
  proxy.ws(req, socket, head, { target }, (err) => {
    logger.error('代理 WebSocket 连接失败:', err);
    socket.destroy();
  });
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝:', reason);
});

// 启动服务器
async function start() {
  try {
    // 启动 HTTP 代理服务器
    server.listen(CONFIG.httpPort, () => {
      logger.info(`代理服务器运行在端口 ${CONFIG.httpPort}`);
    });

    // 启动 gRPC 服务器
    const grpcPort = CONFIG.grpcPort;
    logger.info(`准备启动机器端 gRPC 服务器，端口: ${grpcPort}`);
    startGrpcServer(grpcPort);
    logger.info(`机器端 gRPC 服务器已启动，监听端口 ${grpcPort}`);

    // 启动 gRPC 客户端，连接到管理端
    await startGrpcClient();

    logger.info(`机器客户端已启动，ID: ${CONFIG.machineId}, 连接到管理端: ${CONFIG.managerHost}`);
  } catch (error) {
    logger.error('启动服务器失败:', error);
    process.exit(1);
  }
}

// 启动服务器
start();
