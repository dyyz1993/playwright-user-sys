/**
 * 测试数据工厂
 * 用于创建测试数据
 */
import { UserModel } from '../../models/user.model.js';
import { SessionModel } from '../../models/session.model.js';
import { MachineModel } from '../../models/machine.model.js';
import { hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus, SessionCreateOptions } from '../../shared/types/index.js';

/**
 * 创建测试用户
 * @param overrides 覆盖默认值
 * @returns 用户对象
 */
export async function createTestUser(
  overrides: Partial<{
    username: string;
    password: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    credits: number;
    webhook_url: string;
  }> = {}
) {
  const timestamp = Date.now();
  return UserModel.create({
    username: `testuser_${timestamp}`,
    password: await hashPassword('password123'),
    email: `test_${timestamp}@example.com`,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    credits: 100,
    ...overrides,
  });
}

/**
 * 创建测试管理员
 * @param overrides 覆盖默认值
 * @returns 管理员对象
 */
export async function createTestAdmin(
  overrides: Partial<{
    username: string;
    password: string;
    email: string;
    status: UserStatus;
    credits: number;
  }> = {}
) {
  const timestamp = Date.now();
  return UserModel.create({
    username: `testadmin_${timestamp}`,
    password: await hashPassword('password123'),
    email: `admin_${timestamp}@example.com`,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    credits: 1000,
    ...overrides,
  });
}

/**
 * 创建测试会话
 * @param userId 用户ID
 * @param overrides 覆盖默认值
 * @returns 会话对象
 */
export async function createTestSession(
  userId: number,
  overrides: Partial<{
    machine_id: string;
    port: number;
    status: import('../../shared/types/index.js').SessionStatus;
    options: SessionCreateOptions;
  }> = {}
) {
  const timestamp = Date.now();
  return SessionModel.create({
    user_id: userId,
    machine_id: `machine-${timestamp}`,
    port: 3000 + Math.floor(Math.random() * 1000),
    options: {
      userAgent: 'test-agent',
    },
    ...overrides,
  });
}

/**
 * 创建测试机器
 * @param overrides 覆盖默认值
 * @returns 机器对象
 */
export async function createTestMachine(
  overrides: Partial<{
    id: string;
    hostname: string;
    ip: string;
    grpcPort: number;
    proxyPort: number;
    max_instances: number;
    status: 'online' | 'offline' | 'busy';
  }> = {}
) {
  const timestamp = Date.now();
  return MachineModel.register({
    id: `machine-${timestamp}`,
    hostname: 'test-machine',
    ip: '127.0.0.1',
    grpcPort: 50051,
    proxyPort: 8080,
    max_instances: 10,
    status: 'online',
    ...overrides,
  });
}

/**
 * 创建多个测试用户
 * @param count 用户数量
 * @returns 用户数组
 */
export async function createTestUsers(count: number) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = await createTestUser({
      username: `testuser_${Date.now()}_${i}`,
    });
    users.push(user);
  }
  return users;
}

/**
 * 创建多个测试会话
 * @param userId 用户ID
 * @param count 会话数量
 * @returns 会话数组
 */
export async function createTestSessions(userId: number, count: number) {
  const sessions = [];
  for (let i = 0; i < count; i++) {
    const session = await createTestSession(userId);
    sessions.push(session);
  }
  return sessions;
}

/**
 * 创建多个测试机器
 * @param count 机器数量
 * @returns 机器数组
 */
export async function createTestMachines(count: number) {
  const machines = [];
  for (let i = 0; i < count; i++) {
    const machine = await createTestMachine();
    machines.push(machine);
  }
  return machines;
}
