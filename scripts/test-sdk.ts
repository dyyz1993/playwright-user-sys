import { Client } from '../src/sdk/client.js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 获取 API Key
const API_KEY = process.env.TEST_API_KEY || '';
if (!API_KEY) {
  console.error('错误: 请设置 TEST_API_KEY 环境变量');
  process.exit(1);
}

// 获取 API 基础 URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testSDK() {
  console.log('开始测试 SDK 客户端...');
  console.log(`API 基础 URL: ${API_BASE_URL}`);

  try {
    // 创建客户端实例
    const client = new Client({
      apiKey: API_KEY,
      baseUrl: API_BASE_URL,
    });

    // 创建会话
    console.log('创建会话...');
    const session = await client.sessions.create({
      viewport: {
        width: 1280,
        height: 720,
      },
    });
    console.log('会话创建成功:', session);

    // 获取会话信息
    console.log(`获取会话信息 (ID: ${session.id})...`);
    try {
      const sessionInfo = await client.sessions.get(session.id);
      console.log('会话信息:', sessionInfo);
    } catch (error) {
      console.error('获取会话信息失败:', error);
      console.log('原始会话数据:', session);
      // 继续执行其他测试
    }

    // 列出会话
    console.log('列出会话...');
    try {
      const sessions = await client.sessions.list(1, 10);
      console.log(`获取到 ${sessions.length} 个会话`);
      if (sessions.length > 0) {
        console.log('第一个会话:', {
          id: sessions[0].id,
          status: sessions[0].status,
          created_at: sessions[0].created_at
        });
      }
    } catch (error) {
      console.error('列出会话失败:', error);
      // 继续执行其他测试
    }

    // 等待一段时间，让会话运行
    console.log('等待 5 秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 尝试获取会话截图
    try {
      console.log('获取会话截图...');
      const screenshot = await client.sessions.getScreenshot(session.id);
      console.log('截图 URL:', screenshot.screenshot_url);
    } catch (error) {
      console.warn('获取截图失败，可能是 API 不支持此功能:', error);
    }

    // 释放会话
    console.log('释放会话...');
    const releaseResult = await client.sessions.release(session.id);
    console.log('会话释放结果:', releaseResult);

    console.log('SDK 测试完成');
  } catch (error) {
    console.error('SDK 测试失败:', error);
  }
}

// 运行测试
testSDK();
