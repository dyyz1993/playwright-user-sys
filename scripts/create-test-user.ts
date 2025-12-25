// 使用相对路径导入
import { db } from '../src/config/database.js';
import { UserModel } from '../src/models/user.model.js';
import { UserRole } from '@shared/types/index.js';

// 打印当前工作目录，帮助调试
console.log('当前工作目录:', process.cwd());

async function createTestUser() {
  try {
    console.log('创建测试用户...');

    // 检查用户是否已存在
    let user = await UserModel.findByUsername('test_user');

    if (user) {
      console.log('测试用户已存在，获取其 API Key');
    } else {
      // 创建用户
      user = await UserModel.create({
        username: 'test_user',
        password: 'test_password', // 模型会自动哈希密码
        email: 'test@example.com',
        role: UserRole.USER,
        credits: 100, // 分配 100 点数
      });
      console.log('测试用户创建成功');
    }

    // 获取用户的 API Key
    const apiKey = user?.api_key || '';

    console.log('测试用户信息:');
    console.log(`- 用户名: test_user`);
    console.log(`- 密码: test_password`);
    console.log(`- API Key: ${apiKey}`);
    console.log(`- 点数: ${user?.credits || 100}`);

    // 关闭数据库连接
    await db.destroy();
  } catch (error) {
    console.error('创建测试用户失败:', error);
    process.exit(1);
  }
}

createTestUser();
