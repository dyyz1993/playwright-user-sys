import { describe, beforeAll, afterAll, test, expect } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { UserModel } from '../../models/user.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

describe('管理员添加点数API测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;
  let testUserId: number;

  // 在所有测试之前设置应用和创建测试用户
  beforeAll(async () => {
    // 构建应用实例
    app = await build();

    // 创建测试管理员用户
    const adminUser = await UserModel.create({
      username: 'testadmin',
      password: await hashPassword('password123'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      credits: 1000,
    });

    // 创建测试普通用户
    const regularUser = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
    });

    // 保存测试用户ID
    testUserId = regularUser?.id || 0;

    // 生成JWT令牌
    adminToken = generateToken({
      id: adminUser?.id || 0,
      username: adminUser?.username || '',
      role: (adminUser?.role as UserRole) || UserRole.ADMIN,
    });

    userToken = generateToken({
      id: regularUser?.id || 0,
      username: regularUser?.username || '',
      role: (regularUser?.role as UserRole) || UserRole.USER,
    });
  });

  // 在所有测试之后关闭应用
  afterAll(async () => {
    await app.close();
  });

  // 测试管理员添加点数 - 成功案例
  test('管理员可以成功为用户添加点数', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${testUserId}/credits`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      payload: {
        amount: 50,
        reason: '测试添加点数',
      },
    });

    const result = JSON.parse(response.payload);

    // 验证响应状态码和结构
    expect(response.statusCode).toBe(200);
    expect(result.success).toBe(true);
    expect(result.message).toBe('点数添加成功');
    expect(result.data).toHaveProperty('id', testUserId);
    expect(result.data).toHaveProperty('username', 'testuser');
    expect(result.data).toHaveProperty('credits');

    // 验证点数已增加
    const updatedUser = await UserModel.findById(testUserId);
    expect(updatedUser?.credits).toBe(150); // 原有100点 + 新增50点
  });

  // 注意: 已删除兼容路由的测试

  // 测试普通用户无法添加点数
  test('普通用户无法为其他用户添加点数', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${testUserId}/credits`,
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
      payload: {
        amount: 50,
        reason: '测试添加点数',
      },
    });

    const result = JSON.parse(response.payload);

    // 验证响应状态码和错误信息
    expect(response.statusCode).toBe(403);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();

    // 验证点数未增加
    const updatedUser = await UserModel.findById(testUserId);
    expect(updatedUser?.credits).toBe(200); // 仍然是200点
  });

  // 测试无效的点数金额
  test('添加无效的点数金额应该失败', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${testUserId}/credits`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      payload: {
        amount: -50, // 负数点数
        reason: '测试添加点数',
      },
    });

    const result = JSON.parse(response.payload);

    // 验证响应状态码和错误信息
    expect(response.statusCode).toBe(400);
    expect(result.success).toBe(false);
    expect(result.error).toContain('无效的点数金额');

    // 验证点数未增加
    const updatedUser = await UserModel.findById(testUserId);
    expect(updatedUser?.credits).toBe(200); // 仍然是200点
  });

  // 测试不存在的用户ID
  test('为不存在的用户添加点数应该失败', async () => {
    const nonExistentUserId = 99999;

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${nonExistentUserId}/credits`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      payload: {
        amount: 50,
        reason: '测试添加点数',
      },
    });

    const result = JSON.parse(response.payload);

    // 验证响应状态码和错误信息
    expect(response.statusCode).toBe(404);
    expect(result.success).toBe(false);
    expect(result.error).toContain('用户不存在');
  });

  // 测试未授权访问
  test('未授权访问应该失败', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${testUserId}/credits`,
      payload: {
        amount: 50,
        reason: '测试添加点数',
      },
    });

    const result = JSON.parse(response.payload);

    // 验证响应状态码和错误信息
    expect(response.statusCode).toBe(401);
    expect(result.success).toBe(false);

    // 验证点数未增加
    const updatedUser = await UserModel.findById(testUserId);
    expect(updatedUser?.credits).toBe(200); // 仍然是200点
  });
});
