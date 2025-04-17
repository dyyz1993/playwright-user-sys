import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import path from 'path';

// 配置
const API_KEY = process.env.API_KEY || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const CHECK_INTERVAL_MS = 3000; // 每3秒检查一次点数

if (!API_KEY) {
  console.error('错误: 请设置 API_KEY 环境变量');
  process.exit(1);
}

// 获取用户点数
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

// 创建会话
async function createSession(): Promise<{ sessionId: string, browserWSEndpoint: string }> {
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
  return {
    sessionId: sessionData.data.id,
    browserWSEndpoint: sessionData.data.browserWSEndpoint,
  };
}

// 释放会话
async function releaseSession(sessionId: string): Promise<{ duration: number }> {
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
  return { duration: releaseData.data.duration };
}

// 运行浏览器会话
async function runBrowserSession(instanceNumber: number): Promise<void> {
  try {
    console.log(`[实例 ${instanceNumber}] 创建会话...`);
    const { sessionId, browserWSEndpoint } = await createSession();
    console.log(`[实例 ${instanceNumber}] 会话创建成功: ${sessionId}`);

    // 连接到浏览器
    console.log(`[实例 ${instanceNumber}] 连接到浏览器...`);
    const browser = await puppeteer.connect({
      browserWSEndpoint,
      defaultViewport: { width: 1280, height: 800 },
    });

    // 打开页面
    const page = await browser.newPage();
    await page.goto('https://www.baidu.com');
    console.log(`[实例 ${instanceNumber}] 成功打开百度`);

    // 在页面上执行一些操作
    await page.type('#kw', `Playwright 自动化测试 - 实例 ${instanceNumber}`);
    await page.click('#su');
    console.log(`[实例 ${instanceNumber}] 成功执行搜索`);

    // 等待搜索结果加载
    await page.waitForSelector('.result');

    // 截图
    const screenshotPath = path.resolve(process.cwd(), `instance-${instanceNumber}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`[实例 ${instanceNumber}] 截图已保存为 ${screenshotPath}`);

    // 保持浏览器打开，直到点数耗尽或手动关闭
    console.log(`[实例 ${instanceNumber}] 浏览器会话保持运行中...`);

    // 返回会话ID，以便后续可以关闭
    return sessionId;
  } catch (error) {
    console.error(`[实例 ${instanceNumber}] 运行浏览器会话失败:`, error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    console.log('开始测试点数消耗...');

    // 获取初始点数
    const initialCredits = await getUserCredits();
    console.log(`初始点数: ${initialCredits}`);

    if (initialCredits <= 0) {
      console.error('错误: 用户点数不足，请先分配点数');
      process.exit(1);
    }

    // 创建两个会话
    console.log('创建两个浏览器会话...');
    const sessionPromises = [
      runBrowserSession(1),
      runBrowserSession(2)
    ];

    // 存储会话ID
    const sessionIds = await Promise.all(sessionPromises);
    console.log(`创建了两个会话: ${sessionIds.join(', ')}`);

    // 定期检查点数
    let lastCredits = initialCredits;
    let running = true;
    let startTime = Date.now();
    let elapsedTimeMinutes = 0;

    console.log('\n开始监控点数消耗...');
    console.log('时间(分:秒) | 剩余点数 | 消耗点数 | 状态');
    console.log('-'.repeat(50));

    const intervalId = setInterval(async () => {
      try {
        // 计算已经过去的时间
        const elapsedMs = Date.now() - startTime;
        const minutes = Math.floor(elapsedMs / 60000);
        const seconds = Math.floor((elapsedMs % 60000) / 1000);
        elapsedTimeMinutes = elapsedMs / 60000;

        // 获取当前点数
        const currentCredits = await getUserCredits();
        const consumedCredits = initialCredits - currentCredits;

        // 打印状态
        console.log(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} | ${currentCredits.toString().padStart(5)} | ${consumedCredits.toString().padStart(5)} | ${running ? '运行中' : '已停止'}`);

        // 检查点数是否耗尽
        if (currentCredits <= 0 && running) {
          console.log('\n点数已耗尽，等待系统自动关闭会话...');
          running = false;

          // 等待一段时间，看系统是否会自动关闭会话
          setTimeout(async () => {
            try {
              // 尝试获取会话状态，看是否已经被系统关闭
              const finalCredits = await getUserCredits();
              console.log(`\n最终点数: ${finalCredits}`);
              console.log(`总消耗点数: ${initialCredits - finalCredits}`);
              console.log(`总运行时间: ${elapsedTimeMinutes.toFixed(2)} 分钟`);

              // 清除定时器
              clearInterval(intervalId);

              console.log('\n测试完成，程序将在10秒后退出...');
              setTimeout(() => {
                process.exit(0);
              }, 10000);
            } catch (error) {
              console.error('检查最终状态失败:', error);
            }
          }, 30000); // 等待30秒
        }

        // 如果点数变化，记录下来
        if (currentCredits !== lastCredits) {
          console.log(`\n点数变化: ${lastCredits} -> ${currentCredits} (消耗了 ${lastCredits - currentCredits} 点)`);
          lastCredits = currentCredits;
        }
      } catch (error) {
        console.error('监控点数失败:', error);
      }
    }, CHECK_INTERVAL_MS);

    // 设置超时，防止程序无限运行
    setTimeout(() => {
      console.log('\n测试超时，准备清理资源...');
      clearInterval(intervalId);

      // 尝试释放所有会话
      Promise.all(sessionIds.map(id =>
        releaseSession(id).catch(e => console.error(`释放会话 ${id} 失败:`, e))
      )).then(() => {
        console.log('所有会话已释放');
        process.exit(0);
      }).catch(error => {
        console.error('释放会话失败:', error);
        process.exit(1);
      });
    }, 15 * 60 * 1000); // 15分钟超时
  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

main();
