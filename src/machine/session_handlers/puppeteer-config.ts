import { LaunchOptions } from 'puppeteer-core';
import { CONFIG } from '../config.js';
import { logger } from '@shared/utils/logger.js';
import type { BrowserOptions } from '../types.js';

export async function convertPuppeteerOptions(options: BrowserOptions = {}): Promise<LaunchOptions> {
  const result: LaunchOptions = {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--remote-allow-origins=localhost',
      '--remote-debugging-port=0',
      '--disable-dev-shm-usage',
      '--disable-responsive-ui',
      '--force-device-scale-factor=1',
      '--headless=new',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--force-webrtc-ip-handling-policy',
      '--remote-debugging-address=127.0.0.1',
    ],
    headless: true,
    executablePath: CONFIG.chromePath,
    protocolTimeout: 60000,
  };

  if (!result.args) {
    result.args = [];
  }

  if (options.userDataDir) {
    result.args.push(`--user-data-dir=${options.userDataDir}`);
    logger.info(`设置 userDataDir: ${options.userDataDir}`);
  }

  if (options.args && Array.isArray(options.args)) {
    result.args.push(...options.args);
  }

  if (options.userAgent) {
    result.args.push(`--user-agent=${options.userAgent}`);
  }

  if (options.proxy) {
    result.args.push(`--proxy-server=${options.proxy}`);
  }

  if (options.proxyBypass) {
    result.args.push(`--proxy-bypass-list=${options.proxyBypass}`);
  }

  if (options.viewport) {
    result.args.push(`--window-size=${options.viewport.width},${options.viewport.height}`);
  }

  if (options.defaultViewport) {
    result.defaultViewport = options.defaultViewport;
  } else if (options.viewport) {
    result.defaultViewport = {
      width: options.viewport.width || 1280,
      height: options.viewport.height || 800,
      deviceScaleFactor: 1,
    };
  } else {
    result.defaultViewport = {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    };
  }

  logger.info('result', result);

  return result;
}
