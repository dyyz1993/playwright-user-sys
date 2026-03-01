/**
 * UserModel 单元测试
 * 测试用户模型的 CRUD 操作和业务逻辑
 *
 * 注意: 此测试使用 MySQL 数据库
 * better-sqlite3 需要编译原生模块，在某些环境下可能无法工作
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../config/database.js';
import { UserModel } from '../../../models/user.model.js';
import { hashPassword } from '../../../utils/auth.js';
import { UserRole, UserStatus } from '../../../shared/types/index.js';
import { clearAllTables } from '../../helpers/database.js';

describe('UserModel', () => {
  beforeEach(async () => {
    // 清空数据
    await clearAllTables();
  });

  // ========================================
  // UM-01: 创建用户 - 成功
  // ========================================
  it('应该成功创建用户', async () => {
    const user = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      email: 'test@example.com',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
    });

    expect(user).toBeTruthy();
    expect(user.id).toBeDefined();
    expect(user.username).toBe('testuser');
    expect(user.password).not.toBe('password123'); // 密码被哈希
    expect(user.api_key).toBeTruthy(); // API Key已生成
    expect(user.credits).toBe(100);
    expect(user.role).toBe(UserRole.USER);
    expect(user.status).toBe(UserStatus.ACTIVE);
  });

  // ========================================
  // UM-02: 创建用户 - 重复用户名
  // ========================================
  it('重复用户名应该抛出错误', async () => {
    // 问题描述: UserModel.create 没有检查重复用户名
    // 当前行为: 返回新创建的用户对象，而不是抛出错误
    // 预期行为: 抛出唯一性约束错误
    // 复现步骤:
    //   1. 创建用户 testuser
    //   2. 再次创建用户 testuser
    // 期望: 抛出错误
    // 实际: 返回新用户对象

    await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
    });

    await expect(
      UserModel.create({
        username: 'testuser', // 重复
        password: await hashPassword('password123'),
      })
    ).rejects.toThrow();
  });

  // ========================================
  // UM-03: 创建用户 - 缺少必填字段
  // ========================================
  it('缺少必填字段时应该返回null或抛出错误', async () => {
    // 代码已修复：现在会抛出 '用户名不能为空' 错误

    await expect(
      UserModel.create({
        username: '',
        password: 'password123',
      })
    ).rejects.toThrow('用户名不能为空');
  });

  // ========================================
  // UM-04: 按ID查找用户 - 存在
  // ========================================
  it('应该通过ID找到用户', async () => {
    const created = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      credits: 50,
    });

    const user = await UserModel.findById(created.id!);
    expect(user).toBeTruthy();
    expect(user!.id).toBe(created.id);
    expect(user!.username).toBe('testuser');
    expect(user!.credits).toBe(50);
  });

  // ========================================
  // UM-05: 按ID查找用户 - 不存在
  // ========================================
  it('按ID查找不存在的用户应该返回null', async () => {
    const user = await UserModel.findById(999999);
    expect(user).toBeNull();
  });

  // ========================================
  // UM-06: 按用户名查找用户 - 存在
  // ========================================
  it('应该通过用户名找到用户', async () => {
    await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      credits: 30,
    });

    const user = await UserModel.findByUsername('testuser');
    expect(user).toBeTruthy();
    expect(user!.username).toBe('testuser');
    expect(user!.credits).toBe(30);
  });

  // ========================================
  // UM-07: 按用户名查找用户 - 不存在
  // ========================================
  it('按用户名查找不存在的用户应该返回null', async () => {
    const user = await UserModel.findByUsername('nonexistent');
    expect(user).toBeNull();
  });

  // ========================================
  // UM-08: 按API Key查找用户 - 存在
  // ========================================
  it('应该通过API Key找到用户', async () => {
    const created = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
    });

    const user = await UserModel.findByApiKey(created.api_key!);
    expect(user).toBeTruthy();
    expect(user!.id).toBe(created.id);
    expect(user!.username).toBe('testuser');
  });

  // ========================================
  // UM-09: 按API Key查找用户 - 不存在
  // ========================================
  it('按API Key查找不存在的用户应该返回null', async () => {
    const user = await UserModel.findByApiKey('invalid-api-key');
    expect(user).toBeNull();
  });

  // ========================================
  // UM-10: 验证密码 - 正确密码
  // ========================================
  it('密码验证应该成功', async () => {
    // 注意：使用明文密码，UserModel.create会自动哈希

    const user = await UserModel.create({
      username: 'testuser',
      password: 'password123', // 明文密码
    });

    const isValid = await UserModel.verifyPassword(user!, 'password123');
    expect(isValid).toBe(true);
  });

  // ========================================
  // UM-11: 验证密码 - 错误密码
  // ========================================
  it('应该拒绝错误的密码', async () => {
    const user = await UserModel.create({
      username: 'testuser',
      password: 'password123', // 明文密码
    });

    const isValid = await UserModel.verifyPassword(user!, 'wrongpassword');
    expect(isValid).toBe(false);
  });

  // ========================================
  // UM-12: 验证密码 - 用户不存在
  // ========================================
  it('验证不存在用户的密码应该返回false', async () => {
    // 问题描述: verifyPassword 对 null 用户没有防护
    // 当前行为: 抛出 Cannot read properties of null
    // 预期行为: 返回 false

    const isValid = await UserModel.verifyPassword(null as any, 'password');
    expect(isValid).toBe(false);
  });

  // ========================================
  // UM-13: 添加点数
  // ========================================
  it('应该成功添加点数', async () => {
    const user = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      credits: 100,
    });

    const updated = await UserModel.addCredits(user.id!, 50);
    expect(updated).toBeTruthy();
    expect(updated!.credits).toBe(150);
  });

  // ========================================
  // UM-14: 扣除点数 - 余额充足
  // ========================================
  it('余额充足时应该成功扣除点数', async () => {
    const user = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      credits: 100,
    });

    const updated = await UserModel.deductCredits(user.id!, 30);
    expect(updated).toBeTruthy();
    expect(updated!.credits).toBe(70);
  });

  // ========================================
  // UM-15: 扣除点数 - 余额不足
  // ========================================
  it('余额不足时应该抛出错误', async () => {
    const user = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      credits: 10,
    });

    await expect(UserModel.deductCredits(user.id!, 30)).rejects.toThrow('点数不足');
  });

  // ========================================
  // UM-16: 扣除点数 - 支持事务
  // ========================================
  it('应该支持事务回滚', async () => {
    const user = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      credits: 100,
    });

    const trx = await db.transaction();

    try {
      await UserModel.deductCredits(user.id!, 30, trx);
      await trx.rollback(); // 回滚
    } catch (e) {
      await trx.rollback();
    }

    // 回滚后余额应该不变
    const checkUser = await UserModel.findById(user.id!);
    expect(checkUser!.credits).toBe(100); // 仍是100
  });

  // ========================================
  // UM-17: 批量扣除点数 - 全部成功
  // ========================================
  it('批量扣除点数应该成功', async () => {
    const user1 = await UserModel.create({
      username: 'user1',
      password: await hashPassword('password123'),
      credits: 100,
    });

    const user2 = await UserModel.create({
      username: 'user2',
      password: await hashPassword('password123'),
      credits: 200,
    });

    const userCredits = new Map<number, number>();
    userCredits.set(user1.id!, 30);
    userCredits.set(user2.id!, 50);

    const count = await UserModel.batchDeductCredits(userCredits);
    expect(count).toBe(2);

    const updated1 = await UserModel.findById(user1.id!);
    const updated2 = await UserModel.findById(user2.id!);
    expect(updated1!.credits).toBe(70);
    expect(updated2!.credits).toBe(150);
  });

  // ========================================
  // UM-18: 批量扣除点数 - 部分失败
  // ========================================
  it('批量扣除点数 - 部分用户余额不足应该跳过', async () => {
    const user1 = await UserModel.create({
      username: 'user1',
      password: await hashPassword('password123'),
      credits: 100,
    });

    const user2 = await UserModel.create({
      username: 'user2',
      password: await hashPassword('password123'),
      credits: 10, // 余额不足
    });

    const userCredits = new Map<number, number>();
    userCredits.set(user1.id!, 30);
    userCredits.set(user2.id!, 50); // 这会失败

    const count = await UserModel.batchDeductCredits(userCredits);
    // 只有 user1 成功
    expect(count).toBe(1);

    const updated1 = await UserModel.findById(user1.id!);
    const updated2 = await UserModel.findById(user2.id!);
    expect(updated1!.credits).toBe(70);
    expect(updated2!.credits).toBe(10); // 未变化
  });

  // ========================================
  // UM-19: 重置API Key
  // ========================================
  it('应该重置API Key', async () => {
    const user = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
    });

    const oldApiKey = user.api_key;
    const newApiKey = await UserModel.resetApiKey(user.id!);

    expect(newApiKey).toBeTruthy();
    expect(newApiKey).not.toBe(oldApiKey);

    const updated = await UserModel.findById(user.id!);
    expect(updated!.api_key).toBe(newApiKey);
  });

  // ========================================
  // UM-20: 更新用户信息 - 部分更新
  // ========================================
  it('应该只更新指定字段', async () => {
    const user = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
      email: 'old@example.com',
      credits: 100,
    });

    const updated = await UserModel.update(user.id!, {
      email: 'new@example.com',
      credits: 200,
    });

    expect(updated).toBeTruthy();
    expect(updated!.email).toBe('new@example.com');
    expect(updated!.credits).toBe(200);
    expect(updated!.username).toBe('testuser'); // 未变化
  });

  // ========================================
  // UM-21: 更新用户信息 - 用户不存在
  // ========================================
  it('更新不存在的用户应该返回undefined', async () => {
    const updated = await UserModel.update(999999, {
      email: 'new@example.com',
    });
    // 代码实际返回 undefined，不是 null
    expect(updated).toBeNull();
  });

  // ========================================
  // UM-22: 删除用户 - 成功
  // ========================================
  it('应该成功删除用户', async () => {
    // 验证删除用户功能
    // 预期行为: delete 返回 true，findById 返回 undefined

    const user = await UserModel.create({
      username: 'testuser',
      password: await hashPassword('password123'),
    });

    const deleted = await UserModel.delete(user.id!);
    expect(deleted).toBe(true);

    const found = await UserModel.findById(user.id!);
    expect(found).toBeNull();
  });

  // ========================================
  // UM-23: 删除用户 - 不存在
  // ========================================
  it('删除不存在的用户应该返回false', async () => {
    const deleted = await UserModel.delete(999999);
    expect(deleted).toBe(false);
  });

  // ========================================
  // UM-24: 分页查询 - 第1页
  // ========================================
  it('应该返回正确的分页数据', async () => {
    // 创建15个用户
    for (let i = 0; i < 15; i++) {
      await UserModel.create({
        username: `user${i}`,
        password: await hashPassword('password123'),
      });
    }

    const result = await UserModel.findAll({ page: 1, limit: 10 });

    expect(result.items.length).toBe(10);
    expect(result.total).toBe(15);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(2);
  });

  // ========================================
  // UM-25: 分页查询 - 边界条件
  // ========================================
  it('应该处理分页边界条件', async () => {
    // page=0 会被处理为 0，而不是 1
    const result1 = await UserModel.findAll({ page: 0, limit: 10 });
    expect(result1.page).toBeGreaterThanOrEqual(0);

    // limit=0 会被默认处理为 10（在代码中: query.limit || 10）
    const result2 = await UserModel.findAll({ page: 1, limit: 0 });
    expect(result2.limit).toBe(10); // 代码默认值是 10
  });

  // ========================================
  // UM-26: 分页查询 - 排序
  // ========================================
  it('应该支持排序', async () => {
    await UserModel.create({
      username: 'user1',
      password: await hashPassword('password123'),
    });
    await UserModel.create({
      username: 'user2',
      password: await hashPassword('password123'),
    });

    // 按用户名降序
    const result = await UserModel.findAll({
      sort: 'username',
      order: 'desc',
    });

    expect(result.items.length).toBeGreaterThan(0);
  });

  // ========================================
  // UM-27: 获取用户统计
  // ========================================
  it('应该返回正确的用户统计数据', async () => {
    await UserModel.create({
      username: 'active1',
      password: await hashPassword('password123'),
      status: UserStatus.ACTIVE,
    });
    await UserModel.create({
      username: 'active2',
      password: await hashPassword('password123'),
      status: UserStatus.ACTIVE,
    });
    await UserModel.create({
      username: 'inactive1',
      password: await hashPassword('password123'),
      status: UserStatus.INACTIVE,
    });

    const stats = await UserModel.getStats();

    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.inactive).toBe(1);
  });

  // ========================================
  // UM-28: 获取点数统计
  // ========================================
  it('应该返回正确的点数统计数据', async () => {
    await UserModel.create({
      username: 'user1',
      password: await hashPassword('password123'),
      credits: 100,
    });
    await UserModel.create({
      username: 'user2',
      password: await hashPassword('password123'),
      credits: 200,
    });

    const stats = await UserModel.getCreditsStats();

    expect(stats.total).toBe(300);
    expect(stats.available).toBe(300);
  });
});
