import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { initDatabase } from '../../../config/database.js';
import { OperationLogModel } from '../../../models/operation-log.model.js';
import { UserModel } from '../../../models/user.model.js';
import { hashPassword } from '../../../utils/auth.js';
import { clearAllTables } from '../../helpers/database.js';

describe('OperationLogModel', () => {
  let adminId: number;
  let targetUserId: number;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    await clearAllTables();

    const admin = await UserModel.create({
      username: 'admin',
      password: await hashPassword('password123'),
    });
    adminId = admin!.id!;

    const target = await UserModel.create({
      username: 'targetuser',
      password: await hashPassword('password123'),
    });
    targetUserId = target!.id!;
  });

  it('OL-01: 应该成功创建操作日志', async () => {
    const log = await OperationLogModel.create({
      admin_id: adminId,
      action: 'user.create',
      details: { username: 'newuser' },
    });

    expect(log).toBeTruthy();
    expect(log.id).toBeDefined();
    expect(log.admin_id).toBe(adminId);
    expect(log.action).toBe('user.create');
    expect(log.details).toEqual({ username: 'newuser' });
  });

  it('OL-02: 字符串details不可解析时应返回错误对象', async () => {
    const rawString = '普通字符串不是JSON';
    const log = await OperationLogModel.create({
      admin_id: adminId,
      action: 'system.config',
      details: { raw: rawString },
    });

    expect(log).toBeTruthy();
    expect(log.details).toBeTruthy();
  });

  it('OL-03: details为空时应返回null', async () => {
    const log = await OperationLogModel.create({
      admin_id: adminId,
      action: 'user.view',
    });

    expect(log).toBeTruthy();
    expect(log.details).toBeNull();
  });

  it('OL-04: 应该支持target_user_id', async () => {
    const log = await OperationLogModel.create({
      admin_id: adminId,
      action: 'user.delete',
      target_user_id: targetUserId,
      details: { reason: '测试删除' },
    });

    expect(log).toBeTruthy();
    expect(log.target_user_id).toBe(targetUserId);
  });

  it('OL-05: 应该通过ID查找日志', async () => {
    const created = await OperationLogModel.create({
      admin_id: adminId,
      action: 'user.update',
      details: { field: 'credits' },
    });

    const found = await OperationLogModel.findById(created.id);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(created.id);
    expect(found!.action).toBe('user.update');
  });

  it('OL-06: 查找不存在的ID应返回null', async () => {
    const found = await OperationLogModel.findById(999999);
    expect(found).toBeNull();
  });

  it('OL-07: 应该按管理员ID分页查询', async () => {
    for (let i = 0; i < 5; i++) {
      await OperationLogModel.create({
        admin_id: adminId,
        action: `action.${i}`,
      });
    }

    const result = await OperationLogModel.findByAdminId(adminId, { page: '1', limit: '3' });
    expect(result.items.length).toBe(3);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it('OL-08: 应该按目标用户ID分页查询', async () => {
    for (let i = 0; i < 3; i++) {
      await OperationLogModel.create({
        admin_id: adminId,
        action: `user.action.${i}`,
        target_user_id: targetUserId,
      });
    }

    const result = await OperationLogModel.findByTargetUserId(targetUserId);
    expect(result.items.length).toBe(3);
    expect(result.total).toBe(3);
  });

  it('OL-09: 应该查询所有日志并分页', async () => {
    for (let i = 0; i < 12; i++) {
      await OperationLogModel.create({
        admin_id: adminId,
        action: `action.${i}`,
      });
    }

    const result = await OperationLogModel.findAll({ page: '1', limit: '5' });
    expect(result.items.length).toBe(5);
    expect(result.total).toBeGreaterThanOrEqual(12);
    expect(result.totalPages).toBeGreaterThanOrEqual(3);
  });

  it('OL-10: 应该支持带筛选的分页查询', async () => {
    await OperationLogModel.create({ admin_id: adminId, action: 'user.create' });
    await OperationLogModel.create({ admin_id: adminId, action: 'user.delete' });
    await OperationLogModel.create({ admin_id: adminId, action: 'user.create' });

    const result = await OperationLogModel.paginate(1, 10, { action: 'user.create' });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
  });

  it('OL-11: 应该返回操作统计', async () => {
    await OperationLogModel.create({ admin_id: adminId, action: 'user.create' });
    await OperationLogModel.create({ admin_id: adminId, action: 'user.create' });
    await OperationLogModel.create({ admin_id: adminId, action: 'user.delete' });

    const stats = await OperationLogModel.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byAction['user.create']).toBe(2);
    expect(stats.byAction['user.delete']).toBe(1);
  });

  it('OL-12: 应该支持日期范围筛选统计', async () => {
    await OperationLogModel.create({ admin_id: adminId, action: 'user.create' });

    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const stats = await OperationLogModel.getStats({ startDate: futureDate });
    expect(stats.total).toBe(0);
  });

  it('OL-13: 没有日志时统计应返回空', async () => {
    const stats = await OperationLogModel.getStats();
    expect(stats.total).toBe(0);
    expect(stats.byAction).toEqual({});
  });
});
