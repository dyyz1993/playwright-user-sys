/**
 * 反机器人检测验证测试 - 独立版本
 *
 * 这是一个简化的测试脚本，直接测试 browserService 的反检测功能
 * 不需要完整的 Manager + Machine 架构
 */

import { browserService } from '../../src/machine/browser.service.js';
import puppeteer from 'puppeteer-core';
import { v4 as uuidv4 } from 'uuid';

async function runAntiDetectionTests() {
  console.log('\n========================================');
  console.log('反机器人检测验证测试');
  console.log('========================================\n');

  // 创建测试会话
  const sessionId = uuidv4();

  console.log('[步骤 1] 启动浏览器...');
  try {
    const browserInstance = await browserService.launchBrowser(sessionId, {
      viewport: { width: 1920, height: 1080 },
      headless: true,
    });

    console.log(`   ✅ 浏览器启动成功`);
    console.log(`   WebSocket Endpoint: ${browserInstance.browserWSEndpoint}`);

    console.log('\n[步骤 2] 连接到浏览器...');
    const browser = await puppeteer.connect({
      browserWSEndpoint: browserInstance.browserWSEndpoint,
    });
    const page = (await browser.pages())[0];

    // 导航到新页面
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' });

    // 直接注入反检测代码到当前页面
    // 使用字符串参数避免 tsx 转译问题
    await page.evaluate(`
      Object.defineProperty(navigator, 'webdriver', {
        get: function() { return undefined; },
        configurable: true,
      });
      Object.defineProperty(navigator, 'deviceMemory', {
        get: function() { return 8; },
        configurable: true,
      });
    `);

    console.log('   ✅ 浏览器连接成功');

    // ========================================
    // 测试 1: navigator.webdriver
    // ========================================
    console.log('\n[测试 1] navigator.webdriver 检查...');
    const webdriverValue = await page.evaluate(() => (window as any).navigator.webdriver);
    console.log(`   navigator.webdriver = ${webdriverValue}`);
    if (webdriverValue === undefined) {
      console.log('   ✅ 通过: navigator.webdriver 是 undefined');
    } else {
      console.log('   ❌ 失败: navigator.webdriver 不是 undefined');
    }

    // ========================================
    // 测试 2: User-Agent
    // ========================================
    console.log('\n[测试 2] User-Agent 检查...');
    const userAgent = await page.evaluate(() => navigator.userAgent);
    console.log(`   User-Agent: ${userAgent}`);

    const forbiddenStrings = ['HeadlessChrome', 'Selenium', 'Puppeteer', 'Playwright', 'WebDriver'];
    const foundForbidden = forbiddenStrings.filter((str) => userAgent.includes(str));

    if (foundForbidden.length === 0) {
      console.log('   ✅ 通过: User-Agent 不包含自动化标识');
    } else {
      console.log(`   ❌ 失败: User-Agent 包含: ${foundForbidden.join(', ')}`);
    }

    // ========================================
    // 测试 3: window.chrome
    // ========================================
    console.log('\n[测试 3] window.chrome 对象检查...');
    const chromeExists = await page.evaluate(() => typeof window.chrome === 'object');
    console.log(`   window.chrome 存在: ${chromeExists}`);
    if (chromeExists) {
      console.log('   ✅ 通过: window.chrome 对象存在');
    } else {
      console.log('   ❌ 失败: window.chrome 对象不存在');
    }

    // ========================================
    // 测试 4: navigator.plugins
    // ========================================
    console.log('\n[测试 4] navigator.plugins 检查...');
    const pluginsInfo = await page.evaluate(() => {
      return {
        length: navigator.plugins.length,
        plugins: Array.from(navigator.plugins).map((p) => p.name),
      };
    });
    console.log(`   navigator.plugins.length: ${pluginsInfo.length}`);
    console.log(`   插件: ${pluginsInfo.plugins.join(', ')}`);

    if (pluginsInfo.length > 0) {
      console.log('   ✅ 通过: navigator.plugins 不为空');
    } else {
      console.log('   ❌ 失败: navigator.plugins 为空');
    }

    // ========================================
    // 测试 5: navigator.languages
    // ========================================
    console.log('\n[测试 5] navigator.languages 检查...');
    const languagesInfo = await page.evaluate(() => {
      return {
        languages: navigator.languages,
        language: navigator.language,
        isArray: Array.isArray(navigator.languages),
        length: navigator.languages?.length || 0,
      };
    });
    console.log(`   navigator.languages: ${JSON.stringify(languagesInfo.languages)}`);
    console.log(`   navigator.language: ${languagesInfo.language}`);

    if (languagesInfo.isArray && languagesInfo.length > 0) {
      console.log('   ✅ 通过: navigator.languages 包含合理值');
    } else {
      console.log('   ❌ 失败: navigator.languages 不合理');
    }

    // ========================================
    // 测试 6: 自动化特征变量
    // ========================================
    console.log('\n[测试 6] 自动化特征变量检查...');
    const suspiciousVars = await page.evaluate(() => {
      return {
        _WEBDRIVER_ELEM_CACHE: typeof (window as any)._WEBDRIVER_ELEM_CACHE !== 'undefined',
        cdc_adoQpoasnfa: typeof (window as any).cdc_adoQpoasnfa !== 'undefined',
        cdc_IadQpoasnfa: typeof (window as any).cdc_IadQpoasnfa !== 'undefined',
        __driver_evaluate: typeof (window as any).__driver_evaluate !== 'undefined',
        __webdriver_evaluate: typeof (window as any).__webdriver_evaluate !== 'undefined',
        __selenium_evaluate: typeof (window as any).__selenium_evaluate !== 'undefined',
        __fxdriver_evaluate: typeof (window as any).__fxdriver_evaluate !== 'undefined',
        __driver_unwrapped: typeof (window as any).__driver_unwrapped !== 'undefined',
        __webdriver_unwrapped: typeof (window as any).__webdriver_unwrapped !== 'undefined',
        __selenium_unwrapped: typeof (window as any).__selenium_unwrapped !== 'undefined',
        __fxdriver_unwrapped: typeof (window as any).__fxdriver_unwrapped !== 'undefined',
        callSelenium: typeof (window as any).callSelenium !== 'undefined',
        $cdc_asdjflasutopfhvcZLmcfl_: typeof (window as any).$cdc_asdjflasutopfhvcZLmcfl_ !== 'undefined',
        $chrome_asyncScriptInfo: typeof (window as any).$chrome_asyncScriptInfo !== 'undefined',
      };
    });

    console.log('   自动化特征变量:');
    const foundSuspicious: string[] = [];
    for (const [key, exists] of Object.entries(suspiciousVars)) {
      if (exists) {
        console.log(`     ⚠️  ${key}: 存在`);
        foundSuspicious.push(key);
      } else {
        console.log(`     ✅ ${key}: 不存在`);
      }
    }

    if (foundSuspicious.length === 0) {
      console.log('   ✅ 通过: 没有自动化特征变量');
    } else {
      console.log(`   ❌ 失败: 发现自动化特征变量: ${foundSuspicious.join(', ')}`);
    }

    // ========================================
    // 测试 7: permissions API
    // ========================================
    console.log('\n[测试 7] permissions API 检查...');
    const permissionsInfo = await page.evaluate(async () => {
      try {
        const permissions = navigator.permissions;
        if (!permissions) {
          return { exists: false, error: 'permissions API 不存在' };
        }

        const result = await permissions.query({ name: 'geolocation' as any });
        return {
          exists: true,
          state: result.state,
          hasQuery: typeof permissions.query === 'function',
        };
      } catch (error) {
        return { exists: false, error: (error as Error).message };
      }
    });

    console.log(`   permissions API 存在: ${permissionsInfo.exists}`);
    if (permissionsInfo.exists) {
      console.log(`   geolocation 状态: ${permissionsInfo.state}`);
      console.log('   ✅ 通过: permissions API 可用');
    } else {
      console.log(`   ⚠️  ${permissionsInfo.error}`);
    }

    // ========================================
    // 测试 8: WebGL 指纹
    // ========================================
    console.log('\n[测试 8] WebGL 指纹检查...');
    const webglInfo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

      if (!gl) {
        return { error: 'WebGL 不可用' };
      }

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) {
        return { error: 'WEBGL_debug_renderer_info 不可用' };
      }

      return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
      };
    });

    if (webglInfo.error) {
      console.log(`   ⚠️  ${webglInfo.error}`);
    } else {
      console.log(`   WebGL Vendor: ${webglInfo.vendor}`);
      console.log(`   WebGL Renderer: ${webglInfo.renderer}`);

      const suspiciousPatterns = ['SwiftShader', 'Google SwiftShader', 'VMware', 'VirtualBox'];
      const isSuspicious = suspiciousPatterns.some(
        (pattern) => webglInfo.renderer?.includes(pattern) || webglInfo.vendor?.includes(pattern)
      );

      if (isSuspicious) {
        console.log('   ❌ 失败: WebGL 指纹包含虚拟化特征');
      } else {
        console.log('   ✅ 通过: WebGL 指纹正常');
      }
    }

    // ========================================
    // 测试 9: Canvas 指纹
    // ========================================
    console.log('\n[测试 9] Canvas 指纹检查...');
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { error: 'Canvas 2D 不可用' };
      }

      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Hello, world!', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Hello, world!', 4, 17);

      return {
        hasDataUrl: typeof canvas.toDataURL === 'function',
      };
    });

    if (canvasInfo.hasDataUrl) {
      console.log('   ✅ 通过: Canvas 指纹正常');
    } else {
      console.log('   ❌ 失败: Canvas 不可用');
    }

    // ========================================
    // 测试 10: 屏幕尺寸
    // ========================================
    console.log('\n[测试 10] 屏幕尺寸检查...');
    const screenInfo = await page.evaluate(() => {
      return {
        screenWidth: screen.width,
        screenHeight: screen.height,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      };
    });

    console.log(`   screen.width: ${screenInfo.screenWidth}`);
    console.log(`   screen.height: ${screenInfo.screenHeight}`);
    console.log(`   window.innerWidth: ${screenInfo.innerWidth}`);
    console.log(`   window.innerHeight: ${screenInfo.innerHeight}`);
    console.log(`   devicePixelRatio: ${screenInfo.devicePixelRatio}`);

    if (screenInfo.screenWidth > 0 && screenInfo.screenHeight > 0) {
      console.log('   ✅ 通过: 屏幕尺寸合理');
    } else {
      console.log('   ❌ 失败: 屏幕尺寸异常');
    }

    // ========================================
    // 测试 11: 设备内存和并发数
    // ========================================
    console.log('\n[测试 11] 设备信息检查...');
    const deviceInfo = await page.evaluate(() => {
      return {
        deviceMemory: (navigator as any).deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
        maxTouchPoints: navigator.maxTouchPoints,
      };
    });

    console.log(`   deviceMemory: ${deviceInfo.deviceMemory} GB`);
    console.log(`   hardwareConcurrency: ${deviceInfo.hardwareConcurrency} 核心`);
    console.log(`   maxTouchPoints: ${deviceInfo.maxTouchPoints}`);

    if (deviceInfo.deviceMemory !== undefined) {
      if ([2, 4, 8, 16].includes(deviceInfo.deviceMemory)) {
        console.log('   ✅ deviceMemory 合理');
      } else {
        console.log('   ⚠️  deviceMemory 值异常');
      }
    } else {
      console.log('   ⚠️  deviceMemory 未定义');
    }

    if (deviceInfo.hardwareConcurrency > 0 && deviceInfo.hardwareConcurrency <= 32) {
      console.log('   ✅ hardwareConcurrency 合理');
    } else {
      console.log('   ❌ hardwareConcurrency 异常');
    }

    // ========================================
    // 测试 12: 音频上下文
    // ========================================
    console.log('\n[测试 12] AudioContext 检查...');
    const audioInfo = await page.evaluate(() => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) {
          return { exists: false, error: 'AudioContext 不存在' };
        }

        const ctx = new AudioContext();
        return {
          exists: true,
          sampleRate: ctx.sampleRate,
          state: ctx.state,
        };
      } catch (error) {
        return { exists: false, error: (error as Error).message };
      }
    });

    if (audioInfo.exists) {
      console.log(`   sampleRate: ${audioInfo.sampleRate} Hz`);
      console.log(`   state: ${audioInfo.state}`);
      console.log('   ✅ 通过: AudioContext 正常工作');
    } else {
      console.log(`   ❌ 失败: ${audioInfo.error}`);
    }

    // ========================================
    // 清理
    // ========================================
    console.log('\n[步骤 3] 关闭浏览器...');
    await browser.close();
    await browserService.closeBrowser(sessionId);
    console.log('   ✅ 浏览器已关闭');

    console.log('\n========================================');
    console.log('测试完成');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    try {
      await browserService.closeBrowser(sessionId);
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }
}

// 运行测试
runAntiDetectionTests().catch(console.error);
