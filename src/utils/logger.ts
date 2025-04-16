import { config } from '../config/index.js';

/**
 * 简单的日志工具类
 */
export const logger = {
  info(message: string, ...args: any[]): void {
    console.log(`\x1b[36m[INFO]\x1b[0m ${message}`, ...args);
  },

  warn(message: string, ...args: any[]): void {
    console.log(`\x1b[33m[WARN]\x1b[0m ${message}`, ...args);
  },

  error(message: string, ...args: any[]): void {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`, ...args);
  },

  debug(message: string, ...args: any[]): void {
    if (config.logging?.level === 'debug') {
      console.log(`\x1b[32m[DEBUG]\x1b[0m ${message}`, ...args);
    }
  }
};

export default logger;
