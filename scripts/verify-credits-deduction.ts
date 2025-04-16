import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import path from 'path';

// 配置
const API_KEY = process.env.API_KEY || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const SESSION_DURATION_SECONDS = 10; // 会话持续时间（秒）
const TEST_ITERATIONS = 3; // 测试迭代次数

if (!API_KEY) {
  console.error('错误: 请设置 API_KEY 环境变量');
  process.exit(1);
}

async function getUserCredits(): Promise<number> {
  const userResponse = await fetch(`${API_BASE_URL}/users/me`, {
    headers: {
      'x-api-key': API_KEY,
    },
  });

  if (!userResponse.ok) {
    const errorText = await userResponse.text();
    throw new Error(`获取用户信息失败: ${userResponse.status} ${errorText}`);
  }

  const userData = await userResponse.json();
  return userData.data.credits;
}

async function createAndReleaseSession(iteration: number): Promise<{ duration: number }> {
  console.log(`\n迭代 ${iteration + 1}/${TEST_ITERATIONS}: 创建会话...`);

  // 创建会话
  const sessionResponse = await fetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      viewport: {
        width: 1280,
        height: 800,
      },
    }),
  });

  if (!sessionResponse.ok) {
    const errorText = await sessionResponse.text();
    throw new Error(`创建会话失败: ${sessionResponse.status} ${errorText}`);
  }

  const sessionData = await sessionResponse.json();
  console.log(`会话创建成功: ${sessionData.data.id}`);

  const sessionId = sessionData.data.id;
  const browserWSEndpoint = sessionData.data.browserWSEndpoint;

  // 连接到浏览器
  console.log('连接到浏览器...');
  const browser = await puppeteer.connect({
    browserWSEndpoint: browserWSEndpoint,
    defaultViewport: { width: 1280, height: 800 },
  });

  // 打开页面
  const page = await browser.newPage();
  await page.goto('https://xiaohongshu.com');
  console.log('成功打开百度');

  // 等待指定时间
  console.log(`等待 ${SESSION_DURATION_SECONDS} 秒...`);
  await new Promise(resolve => setTimeout(resolve, SESSION_DURATION_SECONDS * 1000));

  // 关闭浏览器
  console.log('关闭浏览器...');
  await browser.close();

  // 释放会话
  console.log('释放会话...');
  const releaseResponse = await fetch(`${API_BASE_URL}/sessions/${sessionId}/release`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
    },
  });

  if (!releaseResponse.ok) {
    const errorText = await releaseResponse.text();
    throw new Error(`释放会话失败: ${releaseResponse.status} ${errorText}`);
  }

  const releaseData = await releaseResponse.json();
  console.log(`会话释放成功，持续时间: ${releaseData.data.duration} 秒`);

  return { duration: releaseData.data.duration };
}

async function main() {
  try {
    console.log('开始验证点数扣除功能...');

    // 获取初始点数
    const initialCredits = await getUserCredits();
    console.log(`初始点数: ${initialCredits}`);

    let totalDurationSeconds = 0;
    let expectedDeduction = 0;

    // 运行多次会话
    for (let i = 0; i < TEST_ITERATIONS; i++) {
      const { duration } = await createAndReleaseSession(i);
      totalDurationSeconds += duration;

      // 每个会话单独计算点数
      const sessionMinutes = Math.ceil(duration / 60);
      expectedDeduction += sessionMinutes;

      // 每次迭代后检查点数
      const currentCredits = await getUserCredits();
      console.log(`当前点数: ${currentCredits}`);
    }

    // 获取最终点数
    const finalCredits = await getUserCredits();

    // 计算实际扣除的点数
    const actualDeduction = initialCredits - finalCredits;

    console.log('\n验证结果:');
    console.log(`总会话时长: ${totalDurationSeconds} 秒`);
    console.log(`预期扣除点数: ${expectedDeduction} 点 (每分钟1点)`);
    console.log(`实际扣除点数: ${actualDeduction} 点`);
    console.log(`初始点数: ${initialCredits}`);
    console.log(`最终点数: ${finalCredits}`);

    if (expectedDeduction === actualDeduction) {
      console.log('\n✅ 点数扣除正常工作!');
    } else {
      console.log('\n❌ 点数扣除异常!');
      console.log(`差异: ${expectedDeduction - actualDeduction} 点`);
    }

  } catch (error) {
    console.error('\n验证失败:', error);
    process.exit(1);
  }
}

main();
