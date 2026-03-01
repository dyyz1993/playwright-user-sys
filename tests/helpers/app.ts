/**
 * Fastify 应用构建器
 * 用于在测试中构建和管理 Fastify 应用实例
 */

import Fastify, { FastifyInstance } from 'fastify';
import { build as buildApp } from '../../src/app.js';
import { getTestDbConnection, closeDatabase } from './database.js';
import { logger } from '../../src/shared/utils/logger.js';

/**
 * 测试应用配置选项
 */
export interface TestAppOptions {
  port?: number;
  logger?: boolean;
}

/**
 * 测试应用构建器类
 */
export class TestAppBuilder {
  private app: FastifyInstance | null = null;
  private server: any = null;
  private port: number;

  constructor(private options: TestAppOptions = {}) {
    this.port = options.port || 0; // 0 表示随机端口
  }

  /**
   * 构建 Fastify 应用
   */
  async build(): Promise<FastifyInstance> {
    if (this.app) {
      return this.app;
    }

    // 设置测试环境
    process.env.NODE_ENV = 'test';

    try {
      // 使用现有的 build 函数
      this.app = await buildApp();

      // 禁用日志（测试环境）
      if (!this.options.logger) {
        this.app.log.warn = () => {};
        this.app.log.error = () => {};
        this.app.log.info = () => {};
      }

      return this.app;
    } catch (error) {
      console.error('构建测试应用失败:', error);
      throw error;
    }
  }

  /**
   * 启动应用服务器
   */
  async start(): Promise<{ app: FastifyInstance; port: number; url: string }> {
    const app = await this.build();

    try {
      // 监听端口
      const address = await app.listen({
        port: this.port,
        host: '127.0.0.1',
      });

      // 解析端口号
      const url = new URL(address);
      const port = parseInt(url.port, 10);
      this.port = port;

      return {
        app,
        port,
        url: `http://127.0.0.1:${port}`,
      };
    } catch (error) {
      console.error('启动测试应用失败:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 清理应用资源
   */
  async cleanup(): Promise<void> {
    if (this.app) {
      try {
        await this.app.close();
      } catch (error) {
        console.error('关闭应用失败:', error);
      }
      this.app = null;
    }
  }

  /**
   * 获取应用实例
   */
  getApp(): FastifyInstance | null {
    return this.app;
  }
}

/**
 * 构建测试应用（便捷函数）
 * @param options 应用配置选项
 * @returns Promise<FastifyInstance> 应用实例
 */
export async function build(options: TestAppOptions = {}): Promise<FastifyInstance> {
  const builder = new TestAppBuilder(options);
  return builder.build();
}

/**
 * 构建并启动测试应用
 * @param options 应用配置选项
 * @returns Promise<{ app: FastifyInstance; port: number; url: string }>
 */
export async function buildAndStart(
  options: TestAppOptions = {}
): Promise<{ app: FastifyInstance; port: number; url: string }> {
  const builder = new TestAppBuilder(options);
  return builder.start();
}

/**
 * 清理测试应用
 * @param app 应用实例
 */
export async function cleanupTestApp(app: FastifyInstance): Promise<void> {
  try {
    await app.close();
  } catch (error) {
    console.error('清理测试应用失败:', error);
  }
}

/**
 * 完整的测试环境清理
 */
export async function cleanupFullTestEnvironment(): Promise<void> {
  try {
    // 关闭数据库连接
    await closeDatabase();
  } catch (error) {
    console.error('清理测试环境失败:', error);
  }
}

/**
 * 导出所有辅助函数
 */
export default {
  TestAppBuilder,
  build,
  buildAndStart,
  cleanupTestApp,
  cleanupFullTestEnvironment,
};
