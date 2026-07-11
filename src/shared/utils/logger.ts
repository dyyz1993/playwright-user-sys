import { config } from '../../config/index.js';
import path from 'path';
import fs from 'fs';
import { STORAGE_CONFIG } from '../../config/storage.config.js';

const SENSITIVE_FIELDS = ['apiKey', 'password', 'token', 'secret', 'authorization'];

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Error) return value;
  if (Array.isArray(value)) return value.map(sanitize);

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitize(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

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
let fileStream = fs.createWriteStream(getLogFileName(), { flags: 'a' });

// 日志级别
const logLevel = config.logging?.level || 'info';

/**
 * 增强的日志工具类
 * - 同时输出到控制台和文件
 * - 按日期自动分割日志文件
 */
export const logger = {
  info(message: string, ...args: unknown[]): void {
    const sanitizedArgs = args.map(sanitize);
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [INFO] ${message}`;
    console.log(`\x1b[36m${formattedMessage}\x1b[0m`, ...sanitizedArgs);
    this.writeToFile(formattedMessage, sanitizedArgs);
  },

  warn(message: string, ...args: unknown[]): void {
    const sanitizedArgs = args.map(sanitize);
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [WARN] ${message}`;
    console.log(`\x1b[33m${formattedMessage}\x1b[0m`, ...sanitizedArgs);
    this.writeToFile(formattedMessage, sanitizedArgs);
  },

  error(message: string, ...args: unknown[]): void {
    const sanitizedArgs = args.map(sanitize);
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [ERROR] ${message}`;
    console.error(`\x1b[31m${formattedMessage}\x1b[0m`, ...sanitizedArgs);
    this.writeToFile(formattedMessage, sanitizedArgs);
  },

  debug(message: string, ...args: unknown[]): void {
    if (logLevel === 'debug') {
      const sanitizedArgs = args.map(sanitize);
      const timestamp = new Date().toISOString();
      const formattedMessage = `[${timestamp}] [DEBUG] ${message}`;
      console.log(`\x1b[32m${formattedMessage}\x1b[0m`, ...sanitizedArgs);
      this.writeToFile(formattedMessage, sanitizedArgs);
    }
  },

  // 将日志写入文件
  writeToFile(message: string, args: unknown[]): void {
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
    } catch (error: unknown) {
      console.error('\x1b[31m[日志写入失败]\x1b[0m', error);
    }
  },

  // 添加日志轮转方法
  rotateLogFile(): void {
    try {
      // 关闭当前日志流
      fileStream.end();

      fileStream = fs.createWriteStream(getLogFileName(), { flags: 'a' });

      // 创建新的日志流
      const newLogFile = getLogFileName();

      // 记录日志轮转信息
      console.log(`\x1b[36m[日志文件已轮转到 ${newLogFile}]\x1b[0m`);
    } catch (error: unknown) {
      console.error('\x1b[31m[日志轮转失败]\x1b[0m', error);
    }
  },

  // 清理过期日志文件
  cleanOldLogs(): void {
    try {
      const cutoff = Date.now() - STORAGE_CONFIG.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(logsDir);
      let cleaned = 0;
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        const filePath = path.join(logsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(
          `\x1b[36m[已清理 ${cleaned} 个过期日志文件（超过 ${STORAGE_CONFIG.LOG_RETENTION_DAYS} 天）]\x1b[0m`
        );
      }
    } catch (error: unknown) {
      console.error('\x1b[31m[清理过期日志失败]\x1b[0m', error);
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
        logger.cleanOldLogs();
      } catch (error: unknown) {
        console.error('\x1b[31m[日志轮转计划失败]\x1b[0m', error);
      } finally {
        // 无论如何都要继续计划下一次轮转
        scheduleLogRotation();
      }
    }, timeUntilMidnight);
  } catch (error: unknown) {
    console.error('\x1b[31m[计划日志轮转失败]\x1b[0m', error);
    // 如果计划失败，尝试在一小时后重试
    setTimeout(() => scheduleLogRotation(), 3600000);
  }
};

// 启动日志轮转计划
scheduleLogRotation();

export default logger;
