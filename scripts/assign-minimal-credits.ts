// 使用相对路径导入
import { db } from '../src/config/database.js';
import { UserModel } from '../src/models/user.model.js';
import { UserRole } from '@shared/types/index.js';
import { OperationLogModel } from '../src/models/operation-log.model.js';

// 打印当前工作目录，帮助调试
console.log('当前工作目录:', process.cwd());

// 要分配的点数（只有2分钟）
const CREDITS_TO_ASSIGN = 2;

async function assignCredits() {
  try {
    console.log('分配最小点数给测试用户...');

    // 检查用户是否已存在
    let user = await UserModel.findByUsername('test_user');

    if (!user) {
      // 创建用户
      user = await UserModel.create({
        username: 'test_user',
        password: 'test_password', // 模型会自动哈希密码
        email: 'test@example.com',
        role: UserRole.USER,
        credits: 0, // 初始点数为0
      });
      console.log('测试用户创建成功');
    }

    // 获取当前点数
    const currentCredits = user.credits;
    console.log(`当前点数: ${currentCredits}`);

    // 重置点数为指定值
    await db('users').where({ id: user.id }).update({ credits: CREDITS_TO_ASSIGN });
    
    // 记录操作日志
    try {
      await OperationLogModel.create({
        admin_id: 1, // 假设管理员ID为1
        action: '添加点数',
        details: JSON.stringify({
          amount: CREDITS_TO_ASSIGN,
          reason: '测试点数耗尽',
        }),
        target_user_id: user.id,
      });
    } catch (error) {
      console.error('记录操作日志失败:', error);
    }

    // 重新获取用户信息
    user = await UserModel.findById(user.id);

    // 获取用户的 API Key
    const apiKey = user?.api_key || '';

    console.log('测试用户信息:');
    console.log(`- 用户名: test_user`);
    console.log(`- 密码: test_password`);
    console.log(`- API Key: ${apiKey}`);
    console.log(`- 点数: ${user?.credits || 0}`);
    console.log(`\n使用以下命令运行测试脚本:`);
    console.log(`API_KEY=${apiKey} npx tsx scripts/test-credits-depletion.ts`);

    // 关闭数据库连接
    await db.destroy();
  } catch (error) {
    console.error('分配点数失败:', error);
    process.exit(1);
  }
}

assignCredits();
