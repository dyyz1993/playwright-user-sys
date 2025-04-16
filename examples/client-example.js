import { Client } from '../dist/sdk/client.js';

// 创建客户端实例
const client = new Client({
  apiKey: process.env.API_KEY || 'your-api-key',
  baseUrl: process.env.API_URL || 'http://localhost:3000',
});

async function main() {
  try {
    console.log('创建会话...');
    
    // 创建会话
    const session = await client.sessions.create({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: {
        width: 1920,
        height: 1080,
      },
    });
    
    console.log('会话已创建:', session);
    
    // 在实际应用中，这里会连接到浏览器
    console.log(`浏览器 WebSocket 端点: wss://connect.server.dev/ws?apiKey=${process.env.API_KEY}&sessionId=${session.id}`);
    
    // 等待一段时间
    console.log('等待 10 秒...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 释放会话
    console.log('释放会话...');
    const result = await client.sessions.release(session.id);
    
    console.log('会话已释放:', result);
  } catch (error) {
    console.error('错误:', error.message);
  }
}

main();
