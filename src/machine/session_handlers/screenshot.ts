import { Page } from 'puppeteer-core';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import { logger } from '@shared/utils/logger.js';
import { clampScreenshotSize } from '../utils/screenshot-size.js';

export interface ScreenshotContext {
  getSessionPage(sessionId: string): Promise<Page | null>;
  emit(event: string | symbol, ...args: unknown[]): boolean;
}

export async function takeScreenshot(
  ctx: ScreenshotContext,
  sessionId: string,
  onResult: (screenshotUrl: string) => void
): Promise<string | undefined> {
  try {
    const screenshotDir = path.join(CONFIG.dataDir, 'screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });
    const filename = `${sessionId}-${uuidv4()}.jpeg`;
    const filePath = path.join(screenshotDir, filename);
    const screenshotUrl = `/screenshots/${filename}`;
    const page = await ctx.getSessionPage(sessionId);
    if (page) {
      const viewport = page.viewport();
      const screenshotOptions: {
        type: 'jpeg';
        quality: number;
        clip?: { x: number; y: number; width: number; height: number };
      } = {
        type: 'jpeg',
        quality: 80,
      };
      if (viewport) {
        const clamped = clampScreenshotSize(viewport.width, viewport.height);
        if (clamped.width !== viewport.width || clamped.height !== viewport.height) {
          screenshotOptions.clip = { x: 0, y: 0, width: clamped.width, height: clamped.height };
          logger.info(
            `截图尺寸已限制 (sessionId: ${sessionId}): ${viewport.width}x${viewport.height} -> ${clamped.width}x${clamped.height}`
          );
        }
      }
      const buffer = await page.screenshot(screenshotOptions);
      await fs.writeFile(filePath, buffer);
      logger.info(`截图已保存 (sessionId: ${sessionId}): ${filePath} (${(buffer.length / 1024).toFixed(1)}KB)`);
    } else {
      const placeholder = Buffer.from([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00,
        0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
        0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
      ]);
      await fs.writeFile(filePath, placeholder);
      logger.warn(`页面未就绪，写入占位图 (sessionId: ${sessionId})`);
    }
    onResult(screenshotUrl);
    ctx.emit('sessionScreenshot', sessionId, screenshotUrl);
    return screenshotUrl;
  } catch (error: unknown) {
    logger.error(`截图失败 (sessionId: ${sessionId}):`, error);
    return undefined;
  }
}
