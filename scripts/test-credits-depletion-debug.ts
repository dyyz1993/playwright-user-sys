import fetch from 'node-fetch';
import puppeteer from 'puppeteer-core';

// 配置
const API_KEY = process.env.API_KEY || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

if (!API_KEY) {
  console.error('错误: 请设置 API_KEY 环境变量');
  process.exit(1);
}

// 获取用户信息
async function getUserInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
      headers: {
        'x-api-key': API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`获取用户信息失败: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('获取用户信息失败:', error);
    throw error;
  }
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

// 主函数
async function main() {
  try {
    console.log('开始测试点数耗尽自动关闭功能...');

    // 获取用户信息
    const user = await getUserInfo();
    console.log(`用户: ${user.username}, 当前点数: ${user.credits}`);

    // 创建会话
    console.log('创建会话...');
    const session = await createSession();
    console.log(`会话创建成功: ${session.id}`);
    console.log(`浏览器WebSocket端点: ${session.browserWSEndpoint}`);
    console.log(session)
    // 连接到浏览器
    console.log('连接到浏览器...');
    const browser = await puppeteer.connect({
      browserWSEndpoint: session.browserWSEndpoint,
      defaultViewport: { width: 1280, height: 800 },
    });

    // 设置错误处理
    browser.on('disconnected', () => {
      const endTime = new Date();
      console.log(`浏览器已断开连接，可能是由于点数耗尽，时间: ${endTime.toLocaleTimeString()}`);
      process.exit(0);
    });

    // 打开页面
    const page = await browser.newPage();
    await page.goto('https://www.baidu.com');
    console.log('成功打开百度');

    // 在页面上执行一些操作
    await page.type('#kw', 'Playwright 自动化测试');
    await page.click('#su');
    console.log('成功执行搜索');

    // 等待搜索结果加载
    await page.waitForSelector('.result');
    console.log('搜索结果已加载');

    // 记录开始时间
    const startTime = new Date();
    console.log(`开始时间: ${startTime.toLocaleTimeString()}`);
    console.log(`预计会话将在 ${user.credits} 分钟后结束`);
    console.log('保持浏览器打开，等待点数耗尽...');

    // 设置定时器，每5秒检查一次用户点数
    let lastCredits = user.credits;
    const checkInterval = setInterval(async () => {
      try {
        const updatedUser = await getUserInfo();
        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const remainingSeconds = elapsedSeconds % 60;
        
        console.log(`已运行 ${elapsedMinutes}分${remainingSeconds}秒，当前点数: ${updatedUser.credits}`);
        
        // 如果点数变化，记录下来
        if (updatedUser.credits !== lastCredits) {
          console.log(`点数变化: ${lastCredits} -> ${updatedUser.credits}`);
          lastCredits = updatedUser.credits;
        }
        
        // 如果点数已耗尽，等待系统自动关闭
        if (updatedUser.credits <= 0) {
          console.log('点数已耗尽，等待系统自动关闭会话...');
          
          // 检查浏览器是否仍然连接
          try {
            const pages = await browser.pages();
            console.log(`浏览器仍然连接，当前有 ${pages.length} 个页面`);
          } catch (error) {
            console.log('浏览器已断开连接',error);
            clearInterval(checkInterval);
            process.exit(0);
          }
        }
      } catch (error) {
        console.error('检查点数失败:', error);
        
        // 检查是否是因为浏览器断开连接导致的错误
        if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
          console.log('浏览器已断开连接');
          clearInterval(checkInterval);
          process.exit(0);
        }
      }
    }, 5000);

    // 设置超时，防止程序无限运行
    setTimeout(() => {
      console.log('测试超时，手动关闭浏览器');
      clearInterval(checkInterval);
      browser.close().catch(e => console.error('关闭浏览器失败:', e));
      process.exit(0);
    }, 10 * 60 * 1000); // 10分钟超时
  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

main();
