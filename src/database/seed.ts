import { db } from './index.js';
import { hash } from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

/**
 * 数据库种子函数 - 创建默认管理员账户
 */
export async function seedDatabase(): Promise<void> {
  try {
    // 检查是否已存在管理员用户
    const adminUser = await db('users')
      .where('role', 'admin')
      .first();

    if (!adminUser) {
      logger.info('创建默认管理员账户...');

      // 获取环境变量中的管理员用户名和密码，如果没有则使用默认值
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'REDACTED_ADMIN_PASS';
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';

      // 生成密码哈希
      const passwordHash = await hash(adminPassword, 10);

      // 生成 API Key
      const apiKey = uuidv4();

      // 创建管理员用户
      await db('users').insert({
        username: adminUsername,
        password: passwordHash,
        email: adminEmail,
        role: 'admin',
        status: 'active',
        api_key: apiKey,
        credits: 1000, // 默认点数
      });

      // 插入默认系统设置
      const defaultSettings = [
        { key: 'email_notifications', value: 'true' },
        { key: 'webhook_notifications', value: 'true' },
        { key: 'session_timeout', value: '60' },
        { key: 'max_sessions', value: '5' },
        { key: 'ip_restriction', value: 'false' },
        { key: 'ip_whitelist', value: '' },
        { key: 'rate_limiting', value: 'true' }
      ];

      for (const setting of defaultSettings) {
        await db('settings').insert(setting);
      }

      logger.info(`默认管理员账户已创建: ${adminUsername}`);
      logger.info(`默认密码: ${adminPassword}`);
      logger.info(`API Key: ${apiKey}`);
      logger.info('请在首次登录后更改默认密码');
    } else {
      logger.info('管理员账户已存在，跳过创建默认账户');
    }
  } catch (error: any) {
    logger.error('创建默认管理员账户失败:', error);
    throw error;
  }
}
