/**
 * 测试数据工厂
 * 用于创建测试所需的用户、机器、会话等数据
 */

import { UserModel } from '../../src/models/user.model.js';
import { MachineModel } from '../../src/models/machine.model.js';
import { SessionModel } from '../../src/models/session.model.js';
import { CreditHistoryModel } from '../../src/models/credit-history.model.js';
import { SessionStatus, UserRole } from '../../src/shared/types/index.js';
import { getFreePort } from './ports.js';

/**
 * 生成随机用户名
 * @param prefix 前缀
 * @returns 随机用户名
 */
export function generateUsername(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成随机机器 ID
 * @returns 随机机器 ID
 */
export function generateMachineId(): string {
  return `test-machine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建测试用户
 * @param overrides 覆盖的字段
 * @returns Promise<User> 用户对象
 */
export async function createTestUser(overrides: Partial<any> = {}): Promise<any> {
  const defaultUser = {
    username: generateUsername('user'),
    password: 'password123',
    role: UserRole.USER,
    credits: 100,
    email: `test_${Date.now()}@example.com`,
    webhook_url: null,
  };

  const userData = { ...defaultUser, ...overrides };

  try {
    const user = await UserModel.create(userData);
    console.log(`✅ 创建测试用户: ${user.username}, 积分: ${user.credits}`);
    return user;
  } catch (error: any) {
    console.error('创建测试用户失败:', error.message);
    throw error;
  }
}

/**
 * 创建测试管理员
 * @param overrides 覆盖的字段
 * @returns Promise<User> 管理员对象
 */
export async function createTestAdmin(overrides: Partial<any> = {}): Promise<any> {
  return createTestUser({
    ...overrides,
    role: 'admin',
    username: generateUsername('admin'),
  });
}

/**
 * 创建积分不足的用户
 * @param credits 积分数量（默认为 0）
 * @returns Promise<User> 用户对象
 */
export async function createLowCreditUser(credits: number = 0): Promise<any> {
  return createTestUser({
    credits,
    username: generateUsername('lowcredit'),
  });
}

/**
 * 创建测试机器
 * @param overrides 覆盖的字段
 * @returns Promise<Machine> 机器对象
 */
export async function createTestMachine(overrides: Partial<any> = {}): Promise<any> {
  const grpcPort = await getFreePort();
  const proxyPort = await getFreePort();

  const defaultMachine = {
    id: generateMachineId(),
    name: '测试机器',
    hostname: `test-machine-${Date.now()}`,
    ip: '127.0.0.1',
    grpcPort: grpcPort,
    proxyPort: proxyPort,
    max_instances: 5,
    status: 'online',
  };

  const machineData = { ...defaultMachine, ...overrides };

  try {
    const machine = await MachineModel.register(machineData);
    console.log(`✅ 创建测试机器: ${machine.id}, gRPC: ${grpcPort}, Proxy: ${proxyPort}`);
    return machine;
  } catch (error: any) {
    console.error('创建测试机器失败:', error.message);
    throw error;
  }
}

/**
 * 创建在线机器
 * @param overrides 覆盖的字段
 * @returns Promise<Machine> 在线机器对象
 */
export async function createOnlineMachine(overrides: Partial<any> = {}): Promise<any> {
  return createTestMachine({
    ...overrides,
    status: 'online',
    lastSeen: new Date(),
  });
}

/**
 * 创建离线机器
 * @param overrides 覆盖的字段
 * @returns Promise<Machine> 离线机器对象
 */
export async function createOfflineMachine(overrides: Partial<any> = {}): Promise<any> {
  return createTestMachine({
    ...overrides,
    status: 'offline',
    lastSeen: new Date(Date.now() - 3600000), // 1小时前
  });
}

/**
 * 创建满载机器（达到最大会话数）
 * @param overrides 覆盖的字段
 * @returns Promise<Machine> 满载机器对象
 */
export async function createFullMachine(overrides: Partial<any> = {}): Promise<any> {
  return createTestMachine({
    ...overrides,
    max_instances: 5,
    instance_count: 5, // 已达到上限
    status: 'online',
  });
}

/**
 * 创建测试会话
 * @param userId 用户ID
 * @param machineId 机器ID
 * @param overrides 覆盖的字段
 * @returns Promise<Session> 会话对象
 */
export async function createTestSession(userId: number, machineId: string, overrides: Partial<any> = {}): Promise<any> {
  const defaultSession = {
    user_id: userId,
    machine_id: machineId,
    status: SessionStatus.CREATED,
    start_time: new Date(),
    port: Math.floor(Math.random() * 10000) + 5000,
  };

  const sessionData = { ...defaultSession, ...overrides };

  try {
    const session = await SessionModel.create(sessionData);
    console.log(`✅ 创建测试会话: ${session.id}, 用户: ${userId}, 机器: ${machineId}`);
    return session;
  } catch (error: any) {
    console.error('创建测试会话失败:', error.message);
    throw error;
  }
}

/**
 * 创建活跃会话
 * @param userId 用户ID
 * @param machineId 机器ID
 * @param overrides 覆盖的字段
 * @returns Promise<Session> 活跃会话对象
 */
export async function createActiveSession(
  userId: number,
  machineId: string,
  overrides: Partial<any> = {}
): Promise<any> {
  return createTestSession(userId, machineId, {
    ...overrides,
    status: SessionStatus.CONNECTED,
    connected_at: new Date(),
  });
}

/**
 * 创建已结束的会话
 * @param userId 用户ID
 * @param machineId 机器ID
 * @param duration 会话时长（秒）
 * @param overrides 覆盖的字段
 * @returns Promise<Session> 已结束会话对象
 */
export async function createClosedSession(
  userId: number,
  machineId: string,
  duration: number = 120,
  overrides: Partial<any> = {}
): Promise<any> {
  const startTime = new Date(Date.now() - duration * 1000);
  const creditsUsed = Math.max(1, Math.ceil(duration / 60));

  return createTestSession(userId, machineId, {
    ...overrides,
    status: SessionStatus.DISCONNECTED,
    start_time: startTime,
    end_time: new Date(),
    duration,
    credits_used: creditsUsed,
    disconnected_at: new Date(),
  });
}

/**
 * 创建积分历史记录
 * @param userId 用户ID
 * @param amount 积分变化
 * @param action 操作类型
 * @param overrides 覆盖的字段
 * @returns Promise<CreditHistory> 积分历史对象
 */
export async function createCreditHistory(
  userId: number,
  amount: number,
  action: 'add' | 'use' | 'deduct',
  overrides: Partial<any> = {}
): Promise<any> {
  const defaultHistory = {
    user_id: userId,
    amount,
    action,
    balance_after: 0, // 需要查询用户当前积分
    description: `${action} ${Math.abs(amount)} credits`,
  };

  const historyData = { ...defaultHistory, ...overrides };

  try {
    const history = await CreditHistoryModel.create(historyData);
    return history;
  } catch (error: any) {
    console.error('创建积分历史失败:', error.message);
    throw error;
  }
}

/**
 * 批量创建测试用户
 * @param count 用户数量
 * @param overrides 覆盖的字段
 * @returns Promise<User[]> 用户数组
 */
export async function createTestUsers(count: number, overrides: Partial<any> = {}): Promise<any[]> {
  const users: any[] = [];

  for (let i = 0; i < count; i++) {
    const user = await createTestUser({
      ...overrides,
      username: `test_user_${Date.now()}_${i}`,
    });
    users.push(user);
  }

  console.log(`✅ 批量创建 ${count} 个测试用户`);
  return users;
}

/**
 * 批量创建测试机器
 * @param count 机器数量
 * @param overrides 覆盖的字段
 * @returns Promise<Machine[]> 机器数组
 */
export async function createTestMachines(count: number, overrides: Partial<any> = {}): Promise<any[]> {
  const machines: any[] = [];

  for (let i = 0; i < count; i++) {
    const machine = await createTestMachine({
      ...overrides,
      id: `test-machine-${Date.now()}-${i}`,
      name: `测试机器-${i + 1}`,
    });
    machines.push(machine);
  }

  console.log(`✅ 批量创建 ${count} 个测试机器`);
  return machines;
}

/**
 * 创建测试环境（一组测试数据）
 * @param options 配置选项
 * @returns Promise<测试环境> 测试环境对象
 */
export async function createTestEnvironment(
  options: {
    userCount?: number;
    machineCount?: number;
    userCredits?: number;
    machineMaxInstances?: number;
  } = {}
): Promise<{
  users: any[];
  machines: any[];
  admin: any;
}> {
  const { userCount = 1, machineCount = 1, userCredits = 100, machineMaxInstances = 5 } = options;

  // 创建管理员
  const admin = await createTestAdmin({ credits: 1000 });

  // 创建用户
  const users = await createTestUsers(userCount, { credits: userCredits });

  // 创建机器
  const machines = await createTestMachines(machineCount, {
    max_instances: machineMaxInstances,
  });

  console.log(`✅ 创建测试环境: ${users.length} 用户, ${machines.length} 机器`);

  return { users, machines, admin };
}

/**
 * 清理测试数据（按 ID 删除）
 * @param tables 表名和ID的映射
 */
export async function cleanupTestData(tables: {
  users?: number[];
  machines?: string[];
  sessions?: string[];
}): Promise<void> {
  const db = (await import('./database.js')).getTestDbConnection();

  try {
    if (tables.sessions && tables.sessions.length > 0) {
      await db('sessions').whereIn('id', tables.sessions).del();
      console.log(`🧹 清理 ${tables.sessions.length} 个会话`);
    }

    if (tables.machines && tables.machines.length > 0) {
      await db('machines').whereIn('id', tables.machines).del();
      console.log(`🧹 清理 ${tables.machines.length} 个机器`);
    }

    if (tables.users && tables.users.length > 0) {
      await db('users').whereIn('id', tables.users).del();
      console.log(`🧹 清理 ${tables.users.length} 个用户`);
    }
  } catch (error) {
    console.error('清理测试数据失败:', error);
  }
}

/**
 * 导出所有工厂函数
 */
export default {
  createTestUser,
  createTestAdmin,
  createLowCreditUser,
  createTestMachine,
  createOnlineMachine,
  createOfflineMachine,
  createFullMachine,
  createTestSession,
  createActiveSession,
  createClosedSession,
  createCreditHistory,
  createTestUsers,
  createTestMachines,
  createTestEnvironment,
  cleanupTestData,
  generateUsername,
  generateMachineId,
};
