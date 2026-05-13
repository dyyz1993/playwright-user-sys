import path from 'path';
import fs from 'fs/promises';
import { logger } from '@shared/utils/logger.js';
import { fileService } from './file.service.js';

function extractOriginalName(filePath: string): string {
  const basename = path.basename(filePath);
  const match = basename.match(/^\d+-[0-9a-f]+-(.+)$/);
  return match ? match[1] : '';
}

export interface InjectFileOptions {
  sessionId: string;
  filePath: string;
  selector: string;
  frameSelector?: string;
  timeout?: number;
  originalName?: string;
}

export class BrowserInjectService {
  async injectFile(options: InjectFileOptions): Promise<{ success: boolean; error?: string }> {
    const { sessionId, filePath, selector, frameSelector, timeout = 10000, originalName } = options;

    try {
      if (!fileService.validateFilePath(filePath)) {
        throw new Error(`文件路径不安全: ${filePath}`);
      }

      await fs.access(filePath);

      const { browserService } = await import('../browser.service.js');

      const page = await browserService.getSessionPage(sessionId);
      if (!page || page.isClosed()) {
        throw new Error(`会话页面不可用: ${sessionId}`);
      }

      let target: import('puppeteer-core').Page | import('puppeteer-core').Frame = page;

      if (frameSelector) {
        const iframeHandle = await page.waitForSelector(frameSelector, { timeout: 5000 });
        if (!iframeHandle) {
          throw new Error(`找不到 iframe: ${frameSelector}`);
        }
        target = (await iframeHandle.contentFrame())!;
        if (!target) {
          throw new Error(`无法获取 iframe 内容: ${frameSelector}`);
        }
      }

      const fileInput = await target.waitForSelector(selector, { timeout });
      if (!fileInput) {
        throw new Error(`找不到文件输入元素: ${selector}`);
      }

      await fileInput.evaluateHandle((el) => {
        (el as HTMLInputElement).type = 'file';
      });

      let uploadPath = filePath;
      const displayName = originalName || extractOriginalName(filePath);
      if (displayName) {
        const linkDir = path.dirname(filePath);
        const linkPath = path.join(linkDir, displayName);
        try {
          await fs.unlink(linkPath);
        } catch {
          /* ignore */
        }
        await fs.symlink(filePath, linkPath);
        uploadPath = linkPath;
      }

      // @ts-ignore — uploadFile requires ElementHandle<HTMLInputElement>
      await fileInput.uploadFile(uploadPath);

      await target.evaluate((sel: string) => {
        const input = document.querySelector(sel) as HTMLInputElement;
        if (input) {
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, selector);

      logger.info(`文件注入成功: ${path.basename(filePath)} → ${selector} (session: ${sessionId})`);
      return { success: true };
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`文件注入失败 (session: ${sessionId}):`, error);
      return { success: false, error: err.message };
    }
  }
}

export const browserInjectService = new BrowserInjectService();
