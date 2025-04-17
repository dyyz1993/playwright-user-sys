import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import playwright from 'playwright';

// 配置
const API_KEY = process.env.API_KEY || ''; // 从环境变量获取 API Key
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

if (!API_KEY) {
  console.error('错误: 请设置 API_KEY 环境变量');
  process.exit(1);
}

async function main() {
  try {
    console.log('开始测试流程...');
    console.log(`API 基础 URL: ${API_BASE_URL}`);
    console.log(`API Key: ${API_KEY.substring(0, 8)}...`);

    // 步骤 1：创建会话
    console.log('\n步骤 1：创建会话...');
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
      console.error(`创建会话失败: ${sessionResponse.status} ${errorText}`);
      console.log('\n注意: 创建会话失败可能是因为没有可用的实例机器。请确保机器端已经启动并注册到管理服务器。');
      throw new Error(`创建会话失败: ${sessionResponse.status} ${errorText}`);
    }

    const sessionData = await sessionResponse.json();
    console.log('会话创建成功:');
    console.log(JSON.stringify(sessionData, null, 2));

    if (!sessionData.data || !sessionData.data.id || !sessionData.data.browserWSEndpoint) {
      throw new Error('会话响应缺少必要的字段');
    }

    const sessionId = sessionData.data.id;
    const browserWSEndpoint = sessionData.data.browserWSEndpoint;

    // 步骤 2：连接到浏览器
    console.log('\n步骤 2：连接到浏览器...');
    console.log(`WebSocket 端点: ${browserWSEndpoint}`);

    // 确保 WebSocket URL 包含 apiKey
    const wsEndpoint = browserWSEndpoint.includes('apiKey')
      ? browserWSEndpoint
      : `${browserWSEndpoint}${browserWSEndpoint.includes('?') ? '&' : '?'}apiKey=${API_KEY}`;

    console.log(`完整 WebSocket 端点: ${wsEndpoint}`);

    const browser = await puppeteer.connect({
      browserWSEndpoint: sessionData.data.directUrl,
      defaultViewport: { width: 1280, height: 800 },
    });

    // const browser = await playwright.chromium.connectOverCDP(sessionData.data.proxyUrl);
    console.log('成功连接到浏览器');

    // 步骤 3：打开百度
    console.log('\n步骤 3：打开百度...');
    const page = await browser.newPage();
    await page.goto('https://fingerprint-scan.com/canvas');
    console.log('成功打开百度');

    // 步骤 4：截图
    console.log('\n步骤 4：截图...');
    const screenshotPath = path.resolve(process.cwd(), 'baidu.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`截图已保存为 ${screenshotPath}`);

    // 步骤 5：在百度搜索框中输入内容
    console.log('\n步骤 5：在百度搜索框中输入内容...');
    // await page.type('#kw', 'Playwright 自动化测试');
    // await page.click('#su');
    console.log('成功搜索');

    // 等待搜索结果加载
    // await page.waitForSelector('.result');

    // 再次截图
    console.log('\n步骤 6：搜索结果截图...');
    const searchResultPath = path.resolve(process.cwd(), 'baidu-search.png');
    await page.screenshot({ path: searchResultPath });
    console.log(`搜索结果截图已保存为 ${searchResultPath}`);

    // 等待 20 秒
    console.log('\n等待 20 秒...');
    await new Promise(resolve => setTimeout(resolve, 60000));

    // 步骤 7：释放会话（先释放会话再关闭浏览器）
    console.log('\n步骤 7：释放会话...');
    const releaseResponse = await fetch(`${API_BASE_URL}/sessions/${sessionId}/release`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
      },
    });

    // 步骤 8：关闭浏览器
    console.log('\n步骤 8：关闭浏览器...');
    await browser.close();
    console.log('浏览器已关闭');

    if (!releaseResponse.ok) {
      const errorText = await releaseResponse.text();
      throw new Error(`释放会话失败: ${releaseResponse.status} ${errorText}`);
    }

    const releaseData = await releaseResponse.json();
    console.log('会话释放成功:');
    console.log(JSON.stringify(releaseData, null, 2));

    // 步骤 9：检查用户点数
    console.log('\n步骤 9：检查用户点数...');
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
    console.log('用户信息:');
    console.log(JSON.stringify(userData, null, 2));

    console.log('\n测试流程完成');
  } catch (error) {
    console.error('\n测试流程失败:', error);
    process.exit(1);
  }
}

main();
