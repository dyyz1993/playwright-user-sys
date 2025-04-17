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

// 释放会话
async function releaseSession() {
  try {
    console.log(`正在释放会话: ${SESSION_ID}`);
    
    const response = await fetch(`${API_BASE_URL}/sessions/${SESSION_ID}/release`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
      },
    });

    const responseText = await response.text();
    console.log(`响应状态码: ${response.status}`);
    console.log(`响应内容: ${responseText}`);

    if (!response.ok) {
      throw new Error(`释放会话失败: ${response.status} ${responseText}`);
    }

    try {
      const data = JSON.parse(responseText);
      console.log(`会话释放成功: ${JSON.stringify(data, null, 2)}`);
      return data.data;
    } catch (e) {
      console.log('响应不是有效的 JSON 格式');
      return responseText;
    }
  } catch (error) {
    console.error('释放会话失败:', error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    await releaseSession();
  } catch (error) {
    console.error('操作失败:', error);
    process.exit(1);
  }
}

main();
