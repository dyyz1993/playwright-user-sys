import { describe, beforeAll, afterAll, beforeEach, test, expect } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { initDatabase } from '../../config/database.js';
import { UserModel } from '../../models/user.model.js';
import { MachineModel } from '../../models/machine.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { v4 as uuidv4 } from 'uuid';

describe('管理员机器管理功能测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;
  let testMachineId: string;

  // 在所有测试之前设置应用和创建测试用户
  beforeAll(async () => {
    // 初始化数据库
    await initDatabase();

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

    // 创建测试机器
    testMachineId = uuidv4();
    await MachineModel.register({
      id: testMachineId,
      hostname: 'test-machine',
      ip: '192.168.1.100',
      status: 'online',
      cpuUsage: 10,
      memoryUsage: 20,
      diskUsage: 30,
      maxInstances: 5,
    });
  });

  // 在所有测试之后关闭应用
  afterAll(async () => {
    await app.close();
  });

  // 测试获取所有机器功能
  describe('GET /api/machines/', () => {
    test('管理员可以获取所有机器', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/machines/',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);

      // 验证返回的机器中包含我们创建的测试机器
      const foundMachine = result.data.find((machine: any) => machine.id === testMachineId);
      expect(foundMachine).toBeTruthy();
      expect(foundMachine?.hostname).toBe('test-machine');
      expect(foundMachine?.ip).toBe('192.168.1.100');
    });

    test('普通用户无法获取所有机器', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/machines/',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    test('未授权访问应该失败', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/machines/',
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // 测试获取单个机器功能
  describe('GET /api/machines/:id', () => {
    test('管理员可以获取单个机器', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/machines/${testMachineId}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', testMachineId);
      expect(result.data).toHaveProperty('hostname', 'test-machine');
      expect(result.data).toHaveProperty('ip', '192.168.1.100');
    });

    test('普通用户无法获取单个机器', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/machines/${testMachineId}`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    test('获取不存在的机器应该失败', async () => {
      const nonExistentMachineId = 'non-existent-machine-id';

      const response = await app.inject({
        method: 'GET',
        url: `/api/machines/${nonExistentMachineId}`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // 测试标记机器离线功能
  describe('POST /api/machines/:id/offline', () => {
    let machineToMarkOfflineId: string;

    beforeEach(async () => {
      // 创建一个用于标记离线的测试机器
      machineToMarkOfflineId = uuidv4();
      await MachineModel.register({
        id: machineToMarkOfflineId,
        hostname: 'machine-to-mark-offline',
        ip: '192.168.1.101',
        status: 'online',
        cpuUsage: 10,
        memoryUsage: 20,
        diskUsage: 30,
        maxInstances: 5,
      });
    });

    test('管理员可以标记机器离线', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineToMarkOfflineId}/offline`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id', machineToMarkOfflineId);
      expect(result.data).toHaveProperty('status', 'offline');

      // 验证机器状态已更新
      const offlineMachine = await MachineModel.findById(machineToMarkOfflineId);
      expect(offlineMachine?.status).toBe('offline');
    });

    test('普通用户无法标记机器离线', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/machines/${machineToMarkOfflineId}/offline`,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);

      // 验证机器状态未更新
      const machine = await MachineModel.findById(machineToMarkOfflineId);
      expect(machine?.status).toBe('online');
    });

    test('标记不存在的机器离线应该失败', async () => {
      const nonExistentMachineId = 'non-existent-machine-id';

      const response = await app.inject({
        method: 'POST',
        url: `/api/machines/${nonExistentMachineId}/offline`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  // 测试刷新机器状态功能
  describe('POST /api/machines/refresh', () => {
    test('管理员可以刷新机器状态', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/refresh',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('updated');
    });

    test('普通用户无法刷新机器状态', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/refresh',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    test('未授权访问应该失败', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/machines/refresh',
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });
});
