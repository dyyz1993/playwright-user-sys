import fetch from 'node-fetch';
import puppeteer from 'puppeteer-core';

// 配置
const API_KEY = process.env.API_KEY || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

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

// 设置用户点数
async function setUserCredits(userId: number, credits: number) {
  if (!ADMIN_API_KEY) {
    console.error('警告: 未设置 ADMIN_API_KEY，无法设置用户点数');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ADMIN_API_KEY,
      },
      body: JSON.stringify({
        amount: credits,
        reason: '测试点数耗尽自动关闭功能',
      }),
    });

    if (!response.ok) {
      throw new Error(`设置用户点数失败: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    console.log(`已设置用户 ${userId} 的点数为 ${credits}`);
    return data.data;
  } catch (error) {
    console.error('设置用户点数失败:', error);
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

    // 如果有管理员API密钥，设置用户点数为1
    if (ADMIN_API_KEY) {
      await setUserCredits(user.id, 1);
      console.log('已将用户点数设置为1');
    } else if (user.credits <= 0) {
      console.error('错误: 用户点数不足，请先分配点数');
      process.exit(1);
    }

    // 创建会话
    console.log('创建会话...');
    const session = await createSession();
    console.log(`会话创建成功: ${session.id}`);
    console.log(`浏览器WebSocket端点: ${session.browserWSEndpoint}`);

    // 连接到浏览器
    console.log('连接到浏览器...');
    const browser = await puppeteer.connect({
      browserWSEndpoint: session.browserWSEndpoint,
      defaultViewport: { width: 1280, height: 800 },
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
    const startTime = Date.now();
    console.log(`开始时间: ${new Date(startTime).toLocaleTimeString()}`);
    console.log('保持浏览器打开，等待点数耗尽自动关闭...');

    // 设置错误处理
    browser.on('disconnected', () => {
      const endTime = Date.now();
      const duration = Math.floor((endTime - startTime) / 1000);
      console.log(`浏览器已断开连接，可能是由于点数耗尽，持续时间: ${duration}秒`);
      process.exit(0);
    });

    // 设置定时器，每5秒检查一次用户点数
    const checkInterval = setInterval(async () => {
      try {
        const updatedUser = await getUserInfo();
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const remainingSeconds = elapsedSeconds % 60;
        
        console.log(`已运行 ${elapsedMinutes}分${remainingSeconds}秒，当前点数: ${updatedUser.credits}`);
        
        // 如果点数已耗尽，等待系统自动关闭
        if (updatedUser.credits <= 0) {
          console.log('点数已耗尽，等待系统自动关闭会话...');
        }
      } catch (error) {
        console.error('检查点数失败:', error);
      }
    }, 5000);

    // 设置超时，防止程序无限运行
    setTimeout(() => {
      console.log('测试超时，手动关闭浏览器');
      clearInterval(checkInterval);
      browser.close().catch(e => console.error('关闭浏览器失败:', e));
      process.exit(0);
    }, 5 * 60 * 1000); // 5分钟超时
  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

main();
