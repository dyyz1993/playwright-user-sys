import * as puppeteer from 'puppeteer-core';
import { SessionModel } from '../models/session.model.js';
import { MachineModel } from '../models/machine.model.js';
import { UserModel } from '../models/user.model.js';
import { SessionStatus, WebhookEventType } from '../types/index.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { env } from '../config/env.js';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// 存储活跃的浏览器实例
const activeBrowsers = new Map();

// 存储会话超时计时器
const sessionTimeouts = new Map();

/**
 * 启动 Playwright 浏览器实例
 */
export async function launchBrowser(sessionId: string, options: any = {}) {
  try {
    // 查找会话
    const session = await SessionModel.findById(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 检查会话状态
    if (session.status !== SessionStatus.CREATED) {
      throw new Error(`会话状态无效: ${session.status}`);
    }

    // 查找用户
    const user = await UserModel.findById(session.user_id);
    if (!user) {
      throw new Error(`用户不存在: ${session.user_id}`);
    }

    // 检查用户点数
    if (user.credits <= 0) {
      await SessionModel.markError(sessionId);
      await createWebhookEvent(user.id, WebhookEventType.CREDITS_DEPLETED, {
        user_id: user.id,
        username: user.username,
        credits: user.credits,
        timestamp: new Date(),
      });
      throw new Error('用户点数不足');
    }

    // 查找可用的实例机器
    const machine = await MachineModel.findAvailable();
    if (!machine) {
      throw new Error('当前没有可用的实例机器');
    }

    // 启动浏览器
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...options,
    });

    // 获取 WebSocket 端点
    // puppeteer-core 提供了 wsEndpoint() 方法
    const browserWSEndpoint = browser.wsEndpoint();

    // 从 WebSocket 端点提取端口
    const wsUrl = new URL(browserWSEndpoint);
    const port = parseInt(wsUrl.port, 10);

    // 更新会话信息
    await SessionModel.update(sessionId, {
      machine_id: machine.id,
      port,
    });

    // 增加机器的实例计数
    await MachineModel.incrementInstanceCount(machine.id);

    // 存储浏览器实例
    activeBrowsers.set(sessionId, browser);

    // 设置会话超时
    const timeoutId = setTimeout(async () => {
      await releaseBrowser(sessionId);
    }, env.INSTANCE_TIMEOUT);

    sessionTimeouts.set(sessionId, timeoutId);

    // 截取屏幕截图
    await takeScreenshot(sessionId, browser);

    return {
      sessionId,
      browserWSEndpoint,
      port,
    };
  } catch (error: any) {
    console.error(`启动浏览器失败: ${error.message}`);
    throw error;
  }
}

/**
 * 释放 Playwright 浏览器实例
 */
export async function releaseBrowser(sessionId: string) {
  try {
    // 获取浏览器实例
    const browser = activeBrowsers.get(sessionId);
    if (!browser) {
      return;
    }

    // 查找会话
    const session = await SessionModel.findById(sessionId);
    if (!session) {
      return;
    }

    // 清除超时计时器
    const timeoutId = sessionTimeouts.get(sessionId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      sessionTimeouts.delete(sessionId);
    }

    // 计算会话持续时间（秒）
    const now = new Date();
    const startTime = new Date(session.start_time);
    const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

    // 关闭浏览器
    await browser.close();
    activeBrowsers.delete(sessionId);

    // 更新会话状态
    await SessionModel.markDisconnected(sessionId, duration);

    // 如果会话已分配机器，减少机器的实例计数
    if (session.machine_id) {
      await MachineModel.decrementInstanceCount(session.machine_id);
    }

    // 扣除用户点数（1分钟1点）
    const minutes = Math.ceil(duration / 60);
    try {
      await UserModel.deductCredits(session.user_id, minutes);
    } catch (error: any) {
      console.error(`扣除点数失败: ${error.message}`);
    }

    // 触发 Webhook 事件
    await createWebhookEvent(session.user_id, WebhookEventType.SESSION_DISCONNECTED, {
      session_id: sessionId,
      duration,
      disconnected_at: now,
    });

    return {
      sessionId,
      duration,
    };
  } catch (error: any) {
    console.error(`释放浏览器失败: ${error.message}`);
    throw error;
  }
}

/**
 * 截取浏览器屏幕截图
 */
async function takeScreenshot(sessionId: string, browser: any) {
  try {
    // 创建页面
    const page = await browser.newPage();

    // 导航到空白页
    await page.goto('about:blank');

    // 创建截图目录
    const screenshotDir = path.join(env.ROOT_DIR, 'data', 'screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });

    // 生成截图文件名
    const filename = `${sessionId}-${uuidv4()}.png`;
    const screenshotPath = path.join(screenshotDir, filename);

    // 截取屏幕截图
    await page.screenshot({ path: screenshotPath });

    // 关闭页面
    await page.close();

    // 更新会话截图 URL
    const screenshotUrl = `/screenshots/${filename}`;
    await SessionModel.update(sessionId, { screenshot_url: screenshotUrl });

    return screenshotUrl;
  } catch (error: any) {
    console.error(`截取屏幕截图失败: ${error.message}`);
    return null;
  }
}

/**
 * 获取活跃的浏览器实例数量
 */
export function getActiveBrowserCount() {
  return activeBrowsers.size;
}

/**
 * 获取活跃的浏览器实例列表
 */
export function getActiveBrowsers() {
  return Array.from(activeBrowsers.keys());
}

/**
 * 关闭所有浏览器实例
 */
export async function closeAllBrowsers() {
  for (const sessionId of activeBrowsers.keys()) {
    await releaseBrowser(sessionId);
  }
}

export default {
  launchBrowser,
  releaseBrowser,
  getActiveBrowserCount,
  getActiveBrowsers,
  closeAllBrowsers,
};
