import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import playwright, { Route, Request } from 'playwright';

// 配置
const API_KEY = process.env.API_KEY || ''; // 从环境变量获取 API Key
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

if (!API_KEY) {
  console.error('错误: 请设置 API_KEY 环境变量');
  process.exit(1);
}

/**
 * 方式 1：使用 REST API 创建会话，然后连接
 */
async function demoUsingRest() {
  try {
    console.log('开始测试流程 (REST API 方式)...');
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
        // 远程代理（可选）
        // proxy: 'http://android-client-5c598f19:11@REDACTED_PROXY_HOST:8011'
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
    console.log(`http://REDACTED_PROXY_HOST:3001/?sessionId=${sessionId}&domain=REDACTED_PROXY_HOST:8082`);
    console.log(`http://REDACTED_PROXY_HOST:3001/?sessionId=${sessionId}&domain=REDACTED_INTERNAL_HOST:8082`);

    // 步骤 2：连接到浏览器
    console.log('\n步骤 2：连接到浏览器...');
    console.log(`WebSocket 端点: ${browserWSEndpoint}`);

    // 确保 WebSocket URL 包含 apiKey
    const wsEndpoint = browserWSEndpoint.includes('apiKey')
      ? browserWSEndpoint
      : `${browserWSEndpoint}${browserWSEndpoint.includes('?') ? '&' : '?'}apiKey=${API_KEY}`;

    console.log(`完整 WebSocket 端点: ${wsEndpoint}`);
    console.log(`完整 WebSocket 端点: ${sessionData.data.directUrl}`);
    
    // 使用 Playwright 连接
    const browser = await playwright.chromium.connectOverCDP(sessionData.data.directUrl);
    console.log('成功连接到浏览器');

    // 剩余步骤...
    await useBrowser(browser, sessionId);

    // 步骤 7：释放会话（先释放会话再关闭浏览器）
    console.log('\n步骤 7：释放会话...');
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
    console.log('会话释放成功:');
    console.log(JSON.stringify(releaseData, null, 2));

    // 步骤 8：检查用户点数
    await checkUserCredits();

    console.log('\nREST API 方式测试流程完成');
  } catch (error) {
    console.error('\nREST API 方式测试流程失败:', error);
    process.exit(1);
  }
}

/**
 * 方式 2：使用 WebSocket 直连方式创建会话和控制浏览器
 */
async function demoUsingWebSocket() {
  try {
    console.log('开始测试流程 (WebSocket 直连方式)...');
    
    // 步骤 1：直接连接 WebSocket
    console.log('\n步骤 1：直接连接 WebSocket 并创建会话...');
    
    // 构建 WebSocket URL
    const wsBaseUrl = API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '');
    const wsUrl = `${wsBaseUrl}/ws/connect?apiKey=${API_KEY}&width=1280&height=800`;
    console.log(`WebSocket URL: ${wsUrl}`);
    
    // 使用 Playwright 直接连接
    const browser = await playwright.chromium.connectOverCDP(wsUrl);
    console.log('成功连接到浏览器');
    
    // 我们不知道 sessionId，但不需要显式释放，断开连接会自动处理
    await useBrowser(browser);
    
    // 步骤 2：检查用户点数
    await checkUserCredits();
    
    console.log('\nWebSocket 直连方式测试流程完成');
  } catch (error) {
    console.error('\nWebSocket 直连方式测试流程失败:', error);
    process.exit(1);
  }
}

/**
 * 使用浏览器执行通用操作
 */
async function useBrowser(browser, sessionId = null) {
  // 步骤 3：打开页面
  console.log('\n步骤 3：打开页面...');
  const page = await browser.contexts()[0].newPage();
  
  // 设置路由拦截（可选）
  await page.route('**/check1.js', async (route: Route, request: Request) => {
    console.log(`拦截到 check1.js 请求: ${request.url()}`);
    try {
      const response = await route.fetch();
      if (response.ok()) {
        let original_content = await response.text();
        console.log(`获取到原始 check1.js 内容，长度: ${original_content.length}`);

        // 修改内容
        let modified_content = original_content.replace(/const /g, 'var '); // 使用全局替换

        // 添加自定义代码
        modified_content += "\nstackScriptInjectionMatches = {};\n";
        modified_content += "\nchromedriverSourceMatches = [];\n";
        modified_content += "\nhookers = [];\n";
        modified_content += "\nCheck1.prototype.hookFunc=function(){};\n";
        modified_content += "\nconsole.log('hookFunc');\n";
        modified_content += "\nvar _eavl = eval; eval = function(...args){ args[0]=args[0].replace('fpWorkerValidate == true) {',`true || true){`).replace('location.reload(true);',`location.reload(true);`); return _eavl.apply(this,args)};\n";

        console.log(`修改后的 check1.js 内容长度: ${modified_content.length}`);

        // 返回修改后的内容
        await route.fulfill({
          status: 200,
          body: modified_content,
          contentType: 'application/javascript', // 正确的 Content-Type
          headers: {
            'access-control-allow-origin': '*' // 可以根据需要添加其他头
          }
        });
      } else {
        console.error(`获取 check1.js 失败: ${response.status()}`);
        await route.continue();
      }
    } catch (error) {
      console.error(`处理 check1.js 请求时出错: ${error}`);
      await route.abort(); // 或者 route.continue()
    }
  });
  
  // 访问网站
  await page.goto('https://www.goofish.com/');
  
  // 步骤 4：截图
  console.log('\n步骤 4：截图...');
  const screenshotFileName = sessionId ? `baidu-${sessionId}.png` : 'baidu-direct-ws-connect.png';
  const screenshotPath = path.resolve(process.cwd(), screenshotFileName);
  await page.screenshot({ path: screenshotPath });
  console.log(`截图已保存为 ${screenshotPath}`);
  
  // 等待 10 秒
  console.log('\n等待 10 秒...');
  await new Promise(resolve => setTimeout(resolve, 10000));

    // 步骤 4：截图
    console.log('\n步骤 4：截图...');
    await page.screenshot({ path: screenshotPath });
    console.log(`截图已保存为 ${screenshotPath}`);
  
  // 步骤 5：关闭浏览器
  console.log('\n步骤 5：关闭浏览器...');
  await browser.close();
  console.log('浏览器已关闭');
}

/**
 * 检查用户点数
 */
async function checkUserCredits() {
  console.log('\n检查用户点数...');
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
}

async function main() {
  // 确定哪种方式运行演示
  const demoMode = process.env.DEMO_MODE || 'both';
  
  try {
    if (demoMode === 'rest' || demoMode === 'both') {
      console.log('===== 开始 REST API 方式测试 =====');
      await demoUsingRest();
    }
    
    if (demoMode === 'ws' || demoMode === 'both') {
      console.log('\n\n===== 开始 WebSocket 直连方式测试 =====');
      await demoUsingWebSocket();
    }
    
    console.log('\n所有测试完成');
  } catch (error) {
    console.error('\n测试失败:', error);
    process.exit(1);
  }
}

main();
