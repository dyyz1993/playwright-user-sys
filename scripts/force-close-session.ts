import fetch from 'node-fetch';

// 配置
const API_KEY = process.env.API_KEY || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const SESSION_ID = process.env.SESSION_ID || '';

if (!API_KEY) {
  console.error('错误: 请设置 API_KEY 环境变量');
  process.exit(1);
}

if (!SESSION_ID) {
  console.error('错误: 请设置 SESSION_ID 环境变量');
  process.exit(1);
}

// 获取会话信息
async function getSessionInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${SESSION_ID}`, {
      headers: {
        'x-api-key': API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`获取会话信息失败: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('获取会话信息失败:', error);
    throw error;
  }
}

// 释放会话
async function releaseSession() {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${SESSION_ID}/release`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`释放会话失败: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('释放会话失败:', error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    console.log(`开始强制关闭会话: ${SESSION_ID}`);

    // 获取会话信息
    const session = await getSessionInfo();
    console.log(`会话信息: ${JSON.stringify(session, null, 2)}`);

    // 释放会话
    console.log('正在释放会话...');
    const result = await releaseSession();
    console.log(`会话释放成功: ${JSON.stringify(result, null, 2)}`);

  } catch (error) {
    console.error('强制关闭会话失败:', error);
    process.exit(1);
  }
}

main();
