import Koa from 'koa';
import Router from 'koa-router';
import { koaBody } from 'koa-body';
import serve from 'koa-static';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { BrowserManager } from './browser-manager.js';
import { setupEventSocket } from './sockets/event-socket.js';
import { setupVideoSocket } from './sockets/video-socket.js';

// 使用 __dirname 替代方案
const __dirname = path.resolve();

const app = new Koa();
const router = new Router();
const PORT = process.env.PORT || 3001;

// 创建BrowserManager实例
const browserManager = new BrowserManager();

// 初始化
async function init() {
  await browserManager.init({
    'dimensions': {
      'width': 1280,
      'height': 800
    },
    'timezone': 'Asia/Shanghai',
    'userAgent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });
  
  // 中间件
  app.use(koaBody());
  app.use(router.routes()).use(router.allowedMethods());
  app.use(serve(path.join(__dirname, '../../client/dist')));

  // 创建HTTP服务器
  const server = http.createServer(app.callback());
  
  // 创建WebSocket服务器
  const wss = new WebSocketServer({ noServer: true });
  
  // 处理WebSocket升级请求
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    
    // 使用正则表达式从URL路径中提取viewId和类型
    const pathMatch = pathname.match(/^\/ws\/([^\/]+)\/(events|video)$/);
    
    if (!pathMatch) {
      socket.destroy();
      return;
    }
    
    const viewId = pathMatch[1];
    const socketType = pathMatch[2];
    
    if (socketType === 'events') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        setupEventSocket(ws, browserManager, viewId);
      });
    } else if (socketType === 'video') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        setupVideoSocket(ws, browserManager, viewId);
      });
    } else {
      socket.destroy();
    }
  });

  // 路由
  router.get('/', async (ctx) => {
    ctx.body = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Puppeteer远程控制</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            .form-group { margin-bottom: 15px; }
            input[type="text"] { width: 100%; padding: 8px; }
            button { padding: 10px 15px; background: #4CAF50; color: white; border: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <h1>Puppeteer远程控制</h1>
          <div class="form-group">
            <label for="url">请输入要访问的URL:</label>
            <input type="text" id="url" name="url" placeholder="https://example.com" />
          </div>
          <button id="startBtn">开始控制</button>
          
          <script>
            document.getElementById('startBtn').addEventListener('click', async () => {
              const url = document.getElementById('url').value;
              if (!url) {
                alert('请输入URL');
                return;
              }
              
              try {
                const response = await fetch('/api/create-page', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url })
                });
                
                const data = await response.json();
                if (data.success) {
                  window.location.href = \`/control?viewId=\${data.viewId}\`;
                } else {
                  alert(\`错误: \${data.error}\`);
                }
              } catch (err) {
                alert(\`请求失败: \${err.message}\`);
              }
            });
          </script>
        </body>
      </html>
    `;
  });

  // 创建新页面
  router.post('/api/create-page', async (ctx) => {
    try {
      const { url } = ctx.request.body as { url: string };
      if (!url) {
        ctx.status = 400;
        ctx.body = { success: false, error: '请提供URL' };
        return;
      }

      // 创建新页面和viewId
      const viewId = uuidv4();
      await browserManager.createPage(viewId, url);
      
      ctx.body = { success: true, viewId };
    } catch (error) {
      console.error('创建页面失败:', error);
      ctx.status = 500;
      ctx.body = { success: false, error: '创建页面失败' };
    }
  });

  // 启动服务器
  server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
}

init().catch(err => {
  console.error('初始化失败:', err);
  process.exit(1);
}); 