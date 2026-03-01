import { config } from '../../config/index.js';
import path from 'path';
import fs from 'fs';

// 创建日志目录
const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 获取当前日期作为日志文件名
const getLogFileName = () => {
  const now = new Date();
  return path.join(logsDir, `${now.toISOString().split('T')[0]}.log`);
};

// 创建文件输出流
const fileStream = fs.createWriteStream(getLogFileName(), { flags: 'a' });

// 日志级别
const logLevel = config.logging?.level || 'info';

/**
 * 增强的日志工具类
 * - 同时输出到控制台和文件
 * - 按日期自动分割日志文件
 */
export const logger = {
  info(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [INFO] ${message}`;
    console.log(`\x1b[36m${formattedMessage}\x1b[0m`, ...args);
    this.writeToFile(formattedMessage, args);
  },

  warn(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [WARN] ${message}`;
    console.log(`\x1b[33m${formattedMessage}\x1b[0m`, ...args);
    this.writeToFile(formattedMessage, args);
  },

  error(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [ERROR] ${message}`;
    console.error(`\x1b[31m${formattedMessage}\x1b[0m`, ...args);
    this.writeToFile(formattedMessage, args);
  },

  debug(message: string, ...args: any[]): void {
    if (logLevel === 'debug') {
      const timestamp = new Date().toISOString();
      const formattedMessage = `[${timestamp}] [DEBUG] ${message}`;
      console.log(`\x1b[32m${formattedMessage}\x1b[0m`, ...args);
      this.writeToFile(formattedMessage, args);
    }
  },

  // 将日志写入文件
  writeToFile(message: string, args: any[]): void {
    try {
      let logMessage = message;

      if (args.length > 0) {
        const formattedArgs = args
          .map((arg) => {
            if (arg instanceof Error) {
              return arg.stack || arg.message;
            }
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          })
          .join(' ');

        logMessage = `${logMessage} ${formattedArgs}`;
      }

      fileStream.write(logMessage + '\n');
    } catch (error) {
      console.error('\x1b[31m[日志写入失败]\x1b[0m', error);
    }
  },

  // 添加日志轮转方法
  rotateLogFile(): void {
    try {
      // 关闭当前日志流
      fileStream.end();

      // 创建新的日志流
      const newLogFile = getLogFileName();

      // 记录日志轮转信息
      console.log(`\x1b[36m[日志文件已轮转到 ${newLogFile}]\x1b[0m`);
    } catch (error) {
      console.error('\x1b[31m[日志轮转失败]\x1b[0m', error);
    }
  },
};

// 每天凌晨轮转日志文件
const scheduleLogRotation = () => {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const timeUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      try {
        logger.rotateLogFile();
      } catch (error) {
        console.error('\x1b[31m[日志轮转计划失败]\x1b[0m', error);
      } finally {
        // 无论如何都要继续计划下一次轮转
        scheduleLogRotation();
      }
    }, timeUntilMidnight);
  } catch (error) {
    console.error('\x1b[31m[计划日志轮转失败]\x1b[0m', error);
    // 如果计划失败，尝试在一小时后重试
    setTimeout(() => scheduleLogRotation(), 3600000);
  }
};

// 启动日志轮转计划
scheduleLogRotation();

export default logger;
