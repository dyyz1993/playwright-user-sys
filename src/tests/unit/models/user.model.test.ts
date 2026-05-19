import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db, initDatabase } from '../../../config/database.js';
import { UserModel } from '../../../models/user.model.js';
import { hashPassword } from '../../../utils/auth.js';
import { UserRole, UserStatus } from '../../../shared/types/index.js';
import { clearAllTables } from '../../helpers/database.js';

describe('UserModel', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    await clearAllTables();
  });

  let _c = 0;
  const u = (base: string) => `${base}_${Date.now()}_${++_c}`;

  it('应该成功创建用户', async () => {
    const name = u('testuser');
    const user = await UserModel.create({
      username: name,
      password: await hashPassword('password123'),
      email: 'test@example.com',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      credits: 100,
    });

    expect(user).toBeTruthy();
    expect(user!.id).toBeDefined();
    expect(user!.username).toBe(name);
    expect(user!.password).not.toBe('password123');
    expect(user!.api_key).toBeTruthy();
    expect(user!.credits).toBe(100);
    expect(user!.role).toBe(UserRole.USER);
    expect(user!.status).toBe(UserStatus.ACTIVE);
  });

  it('重复用户名应该抛出错误', async () => {
    const dupName = u('testuser');

    const first = await UserModel.create({
      username: dupName,
      password: await hashPassword('password123'),
    });
    expect(first).toBeTruthy();

    await expect(
      UserModel.create({
        username: dupName,
        password: await hashPassword('password123'),
      })
    ).rejects.toThrow();
  });

  it('缺少必填字段时应该返回null或抛出错误', async () => {
    await expect(
      UserModel.create({
        username: '',
        password: 'password123',
      })
    ).rejects.toThrow('用户名不能为空');
  });

  it('应该通过ID找到用户', async () => {
    const name = u('testuser');
    const created = await UserModel.create({
      username: name,
      password: await hashPassword('password123'),
      credits: 50,
    });

    const user = await UserModel.findById(created!.id!);
    expect(user).toBeTruthy();
    expect(user!.id).toBe(created!.id);
    expect(user!.username).toBe(name);
    expect(user!.credits).toBe(50);
  });

  it('按ID查找不存在的用户应该返回null', async () => {
    const user = await UserModel.findById(999999);
    expect(user).toBeNull();
  });

  it('应该通过用户名找到用户', async () => {
    const name = u('testuser');
    await UserModel.create({
      username: name,
      password: await hashPassword('password123'),
      credits: 30,
    });

    const user = await UserModel.findByUsername(name);
    expect(user).toBeTruthy();
    expect(user!.username).toBe(name);
    expect(user!.credits).toBe(30);
  });

  it('按用户名查找不存在的用户应该返回null', async () => {
    const user = await UserModel.findByUsername('nonexistent');
    expect(user).toBeNull();
  });

  it('应该通过API Key找到用户', async () => {
    const created = await UserModel.create({
      username: u('testuser'),
      password: await hashPassword('password123'),
    });

    const user = await UserModel.findByApiKey(created!.api_key!);
    expect(user).toBeTruthy();
    expect(user!.id).toBe(created!.id);
    expect(user!.username).toBe(created!.username);
  });

  it('按API Key查找不存在的用户应该返回null', async () => {
    const user = await UserModel.findByApiKey('invalid-api-key');
    expect(user).toBeNull();
  });

  it('密码验证应该成功', async () => {
    const user = await UserModel.create({
      username: u('testuser'),
      password: 'password123',
    });

    const isValid = await UserModel.verifyPassword(user!, 'password123');
    expect(isValid).toBe(true);
  });

  it('应该拒绝错误的密码', async () => {
    const user = await UserModel.create({
      username: u('testuser'),
      password: 'password123',
    });

    const isValid = await UserModel.verifyPassword(user!, 'wrongpassword');
    expect(isValid).toBe(false);
  });

  it('验证不存在用户的密码应该返回false', async () => {
    const isValid = await UserModel.verifyPassword(null as unknown as Record<string, unknown>, 'password');
    expect(isValid).toBe(false);
  });

  it('应该成功添加点数', async () => {
    const user = await UserModel.create({
      username: u('testuser'),
      password: await hashPassword('password123'),
      credits: 100,
    });

    const updated = await UserModel.addCredits(user!.id!, 50);
    expect(updated).toBeTruthy();
    expect(updated!.credits).toBe(150);
  });

  it('余额充足时应该成功扣除点数', async () => {
    const user = await UserModel.create({
      username: u('testuser'),
      password: await hashPassword('password123'),
      credits: 100,
    });

    const updated = await UserModel.deductCredits(user!.id!, 30);
    expect(updated).toBeTruthy();
    expect(updated!.credits).toBe(70);
  });

  it('余额不足时应该抛出错误', async () => {
    const user = await UserModel.create({
      username: u('testuser'),
      password: await hashPassword('password123'),
      credits: 10,
    });

    await expect(UserModel.deductCredits(user!.id!, 30)).rejects.toThrow('点数不足');
  });

  it('应该支持事务回滚', async () => {
    const user = await UserModel.create({
      username: u('testuser'),
      password: await hashPassword('password123'),
      credits: 100,
    });

    const trx = await db.transaction();

    try {
      await UserModel.deductCredits(user!.id!, 30, trx);
      await trx.rollback();
    } catch (_e) {
      await trx.rollback();
    }

    const checkUser = await UserModel.findById(user!.id!);
    expect(checkUser!.credits).toBe(100);
  });

  it('批量扣除点数应该成功', async () => {
    const user1 = await UserModel.create({
      username: u('user1'),
      password: await hashPassword('password123'),
      credits: 100,
    });
    const user2 = await UserModel.create({
      username: u('user2'),
      password: await hashPassword('password123'),
      credits: 200,
    });

    expect(user1).toBeTruthy();
    expect(user2).toBeTruthy();

    const userCredits = new Map<number, number>();
    userCredits.set(user1!.id!, 30);
    userCredits.set(user2!.id!, 50);

    const count = await UserModel.batchDeductCredits(userCredits);
    expect(count).toBeGreaterThanOrEqual(1);

    const updated1 = await UserModel.findById(user1!.id!);
    expect(updated1!.credits).toBe(70);
  });

  it('批量扣除点数 - 部分用户余额不足应该跳过', async () => {
    const user1 = await UserModel.create({
      username: u('user1'),
      password: await hashPassword('password123'),
      credits: 100,
    });

    expect(user1).toBeTruthy();

    const user2 = await UserModel.create({
      username: u('user2'),
      password: await hashPassword('password123'),
      credits: 10,
    });

    expect(user2).toBeTruthy();

    const userCredits = new Map<number, number>();
    userCredits.set(user1!.id!, 30);
    userCredits.set(user2!.id!, 50);

    const count = await UserModel.batchDeductCredits(userCredits);
    expect(count).toBeGreaterThanOrEqual(0);

    const updated1 = await UserModel.findById(user1!.id!);
    expect(updated1!.credits).toBe(70);
  });

  it('应该重置API Key', async () => {
    const user = await UserModel.create({
      username: u('testuser'),
      password: await hashPassword('password123'),
    });

    const oldApiKey = user!.api_key;
    const newApiKey = await UserModel.resetApiKey(user!.id!);

    expect(newApiKey).toBeTruthy();
    expect(newApiKey).not.toBe(oldApiKey);

    const updated = await UserModel.findById(user!.id!);
    expect(updated!.api_key).toBe(newApiKey);
  });

  it('应该只更新指定字段', async () => {
    const name = u('testuser');
    const user = await UserModel.create({
      username: name,
      password: await hashPassword('password123'),
      email: 'old@example.com',
      credits: 100,
    });

    const updated = await UserModel.update(user!.id!, {
      email: 'new@example.com',
      credits: 200,
    });

    expect(updated).toBeTruthy();
    expect(updated!.email).toBe('new@example.com');
    expect(updated!.credits).toBe(200);
    expect(updated!.username).toBe(name);
  });

  it('更新不存在的用户应该返回undefined', async () => {
    const updated = await UserModel.update(999999, {
      email: 'new@example.com',
    });
    expect(updated).toBeNull();
  });

  it('应该成功删除用户', async () => {
    const user = await UserModel.create({
      username: u('testuser'),
      password: await hashPassword('password123'),
    });

    const deleted = await UserModel.delete(user!.id!);
    expect(deleted).toBe(true);

    const found = await UserModel.findById(user!.id!);
    expect(found).toBeNull();
  });

  it('删除不存在的用户应该返回false', async () => {
    const deleted = await UserModel.delete(999999);
    expect(deleted).toBe(false);
  });

  it('应该返回正确的分页数据', async () => {
    const prefix = `u_${Date.now()}_${Math.random().toString(36).slice(2)}_`;
    let created = 0;
    for (let i = 0; i < 15; i++) {
      const user = await UserModel.create({
        username: `${prefix}${i}`,
        password: await hashPassword('password123'),
      });
      if (user) created++;
    }

    const result = await UserModel.findAll({ page: '1', limit: '10' });

    expect(result.items.length).toBe(Math.min(10, created));
    expect(result.total).toBe(created);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(Math.ceil(created / 10));
  }, 30000);

  it('应该处理分页边界条件', async () => {
    const result1 = await UserModel.findAll({ page: '0', limit: '10' });
    expect(result1.page).toBeGreaterThanOrEqual(0);

    const result2 = await UserModel.findAll({ page: '1', limit: '0' });
    expect(result2.limit).toBe(0);
  });

  it('应该支持排序', async () => {
    await UserModel.create({
      username: u('user1'),
      password: await hashPassword('password123'),
    });
    await UserModel.create({
      username: u('user2'),
      password: await hashPassword('password123'),
    });

    const result = await UserModel.findAll({
      sort: 'username',
      order: 'desc',
    });

    expect(result.items.length).toBeGreaterThan(0);
  });

  it('应该返回正确的用户统计数据', async () => {
    await UserModel.create({
      username: u('active1'),
      password: await hashPassword('password123'),
      status: UserStatus.ACTIVE,
    });
    await UserModel.create({
      username: u('active2'),
      password: await hashPassword('password123'),
      status: UserStatus.ACTIVE,
    });
    await UserModel.create({
      username: u('inactive1'),
      password: await hashPassword('password123'),
      status: UserStatus.INACTIVE,
    });

    const stats = await UserModel.getStats();

    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.inactive).toBe(1);
  });

  it('应该返回正确的点数统计数据', async () => {
    await UserModel.create({
      username: u('user1'),
      password: await hashPassword('password123'),
      credits: 100,
    });
    await UserModel.create({
      username: u('user2'),
      password: await hashPassword('password123'),
      credits: 200,
    });

    const stats = await UserModel.getCreditsStats();

    expect(stats.total).toBe(300);
    expect(stats.available).toBe(300);
  });
});
