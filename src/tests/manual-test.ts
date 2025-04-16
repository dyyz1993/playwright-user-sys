import { UserModel } from '../models/user.model.js';
import { generateToken, hashPassword } from '../utils/auth.js';
import { UserRole, UserStatus } from '../types/index.js';

async function testAdminAuth() {
  try {
    console.log('开始测试管理员权限验证');

    // 创建测试管理员用户
    const adminUser = await UserModel.create({
      username: 'testadmin',
      password: await hashPassword('password123'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      credits: 1000,
    });

    console.log('创建管理员用户成功:', adminUser);

    // 生成JWT令牌
    const adminToken = generateToken({
      id: adminUser?.id || 0,
      username: adminUser?.username || '',
      role: (adminUser?.role as UserRole) || UserRole.ADMIN,
    });

    console.log('生成JWT令牌成功:', adminToken);

    console.log('测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testAdminAuth();
