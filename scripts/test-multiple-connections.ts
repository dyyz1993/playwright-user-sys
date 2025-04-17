import fetch from 'node-fetch';
import puppeteer from 'puppeteer-core';

// 配置
const API_KEY = process.env.API_KEY || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

if (!API_KEY) {
  console.error('错误: 请设置 API_KEY 环境变量');
  process.exit(1);
}

// 创建会话
async function createSession() {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions`, {
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

    if (!response.ok) {
      throw new Error(`创建会话失败: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('创建会话失败:', error);
    throw error;
  }
}

// 连接到浏览器
async function connectToBrowser(browserWSEndpoint: string, connectionName: string) {
  try {
    console.log(`[${connectionName}] 连接到浏览器...`);
    const browser = await puppeteer.connect({
      browserWSEndpoint,
      defaultViewport: { width: 1280, height: 800 },
    });

    console.log(`[${connectionName}] 连接成功`);

    // 打开页面
    const page = await browser.newPage();
    await page.goto('https://www.baidu.com');
    console.log(`[${connectionName}] 成功打开百度`);

    // 在页面上执行一些操作
    await page.type('#kw', `Playwright 自动化测试 - ${connectionName}`);
    await page.click('#su');
    console.log(`[${connectionName}] 成功执行搜索`);

    // 等待搜索结果加载
    await page.waitForSelector('.result');
    console.log(`[${connectionName}] 搜索结果已加载`);

    return browser;
  } catch (error) {
    console.error(`[${connectionName}] 连接失败:`, error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    console.log('开始测试多个连接同一个会话...');

    // 创建会话
    console.log('创建会话...');
    const session = await createSession();
    console.log(`会话创建成功: ${session.id}`);
    console.log(`浏览器WebSocket端点: ${session.browserWSEndpoint}`);

    // 第一个连接
    const browser1 = await connectToBrowser(session.browserWSEndpoint, '连接1');

    // 等待一段时间
    console.log('等待3秒...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 第二个连接
    console.log('尝试第二个连接...');
    try {
      const browser2 = await connectToBrowser(session.browserWSEndpoint, '连接2');
      console.log('警告: 第二个连接成功，这不符合预期！');

      // 如果第二个连接成功，关闭它
      await browser2.close();
    } catch (error) {
      console.log('预期的错误: 第二个连接被拒绝');
      console.log('错误详情:', error.message);
    }

    // 等待一段时间
    console.log('等待5秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 关闭第一个连接
    console.log('关闭第一个连接...');
    await browser1.close();
    console.log('第一个连接已关闭');

    // 等待一段时间
    console.log('等待3秒...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 第三个连接（在第一个连接关闭后）
    console.log('尝试第三个连接...');
    try {
      const browser3 = await connectToBrowser(session.browserWSEndpoint, '连接3');
      console.log('第三个连接成功（在第一个连接关闭后）');

      // 关闭第三个连接
      console.log('关闭第三个连接...');
      await browser3.close();
      console.log('第三个连接已关闭');
    } catch (error) {
      console.log('错误: 第三个连接失败，这不符合预期！');
      console.log('错误详情:', error.message);
    }

    console.log('测试完成');
  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

main();
