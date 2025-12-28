import { test, expect } from '@playwright/test';
import { generateToken, hashPassword } from '../../src/utils/auth.js';
import { db } from '../../src/config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 安全漏洞测试套件
 *
 * 测试类别：
 * - TIER-041 ~ TIER-050: 异常测试（业务逻辑漏洞）
 * - TIER-051 ~ TIER-060: 安全测试（认证与授权漏洞）
 * - TIER-061 ~ TIER-070: 安全测试（资源滥用漏洞）
 * - TIER-071 ~ TIER-080: 安全测试（数据安全漏洞）
 */

const API_BASE = 'http://localhost:3000/api';

// 辅助函数：创建测试用户
async function createTestUser(overrides: any = {}) {
  const userData = {
    username: `test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    password: await hashPassword('TestPassword123'),
    email: `test_${Date.now()}@example.com`,
    role: 'user',
    status: 'active',
    credits: 100,
    api_key: uuidv4(),
    webhook_url: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };

  const [id] = await db('users').insert(userData);
  return { ...userData, id };
}

// 辅助函数：清理测试数据
async function cleanupTestUser(userId: number) {
  await db('sessions').where({ user_id: userId }).delete();
  await db('credit_history').where({ user_id: userId }).delete();
  await db('users').where({ id: userId }).delete();
}

// 辅助函数：创建测试会话
async function createTestSession(userId: number, overrides: any = {}) {
  const sessionId = uuidv4();
  const sessionData = {
    id: sessionId,
    user_id: userId,
    machine_id: null,
    port: null,
    status: 'created',
    options: null,
    start_time: new Date(),
    end_time: null,
    disconnected_at: null,
    duration: 0,
    credits_used: 0,
    screenshot_url: null,
    last_activity: new Date(),
    error_message: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };

  await db('sessions').insert(sessionData);
  return sessionData;
}

describe('TIER 安全漏洞测试套件', () => {
  // ============================================================================
  // 类别 A: 认证与授权漏洞 (TIER-051 ~ TIER-055)
  // ============================================================================

  test.describe('认证与授权漏洞', () => {
    let testUser: any;
    let testUserApiKey: string;

    test.beforeEach(async () => {
      const user = await createTestUser();
      testUser = user;
      testUserApiKey = user.api_key;
    });

    test.afterEach(async () => {
      if (testUser?.id) {
        await cleanupTestUser(testUser.id);
      }
    });

    test('TIER-051: API Key 复用漏洞 - 同一 API Key 可被多个用户共享', async ({ request }) => {
      // 攻击场景：攻击者获取到合法用户的 API Key 后，可以无限期使用
      // 风险：没有 API Key 过期机制，没有 IP 白名单，没有使用频率限制

      // 步骤 1: 创建第二个用户
      const attackerUser = await createTestUser({
        username: `attacker_${Date.now()}`,
        credits: 0
      });

      try {
        // 步骤 2: 攻击者窃取受害者的 API Key
        const stolenApiKey = testUserApiKey;

        // 步骤 3: 攻击者使用窃取的 API Key 创建会话
        const createSessionResponse = await request.post(`${API_BASE}/sessions`, {
          headers: {
            'x-api-key': stolenApiKey
          },
          data: {
            viewport: {
              width: 1920,
              height: 1080
            }
          }
        });

        // 验证点：API 层 - 攻击者可以使用窃取的 API Key
        // 期望：系统应该拒绝（但由于漏洞存在，会接受）
        expect(createSessionResponse.status()).toBe(401); // 应该是 401，但实际可能是 201

        // 步骤 4: 验证如果会话创建成功，积分是从受害者账户扣除
        if (createSessionResponse.status() === 201) {
          const sessionData = await createSessionResponse.json();
          expect(sessionData.success).toBe(true);

          // 验证点：数据库层 - 检查会话归属
          const session = await db('sessions').where({ id: sessionData.data.id }).first();
          expect(session.user_id).toBe(testUser.id); // 会话属于受害者

          // 验证点：业务层 - 积分从受害者扣除
          const victimUser = await db('users').where({ id: testUser.id }).first();
          expect(victimUser.credits).toBeLessThan(100); // 受害者积分减少
        }

        // 清理攻击者用户
        await cleanupTestUser(attackerUser.id);
      } catch (error) {
        // 清理攻击者用户（即使测试失败）
        await cleanupTestUser(attackerUser.id);
        throw error;
      }
    });

    test('TIER-052: 跨用户会话访问漏洞 - 用户可以访问其他用户的会话信息', async ({ request }) => {
      // 攻击场景：用户 A 可以通过枚举 session ID 访问用户 B 的会话

      // 步骤 1: 创建用户 A（攻击者）和用户 B（受害者）
      const userA = await createTestUser({
        username: `userA_${Date.now()}`,
        api_key: uuidv4()
      });
      const userB = await createTestUser({
        username: `userB_${Date.now()}`,
        api_key: uuidv4()
      });

      try {
        // 步骤 2: 用户 B 创建会话
        const userBSession = await createTestSession(userB.id);

        // 步骤 3: 用户 A 尝试访问用户 B 的会话
        const getSessionResponse = await request.get(`${API_BASE}/sessions/${userBSession.id}`, {
          headers: {
            'x-api-key': userA.api_key
          }
        });

        // 验证点：API 层 - 检查访问控制
        // 期望：应该返回 403 Forbidden
        // 如果漏洞存在，可能返回 200 OK 或其他状态码
        const status = getSessionResponse.status();
        expect(status).toBe(403); // 期望正确的权限检查

        // 步骤 4: 如果访问成功，验证数据泄露
        if (status === 200) {
          const sessionData = await getSessionResponse.json();
          expect(sessionData.data.user_id).toBe(userB.id); // 数据泄露：用户 A 可以看到用户 B 的会话
        }

        // 清理
        await cleanupTestUser(userA.id);
        await cleanupTestUser(userB.id);
      } catch (error) {
        await cleanupTestUser(userA.id);
        await cleanupTestUser(userB.id);
        throw error;
      }
    });

    test('TIER-053: 管理员权限绕过漏洞 - 普通用户可以访问管理员接口', async ({ request }) => {
      // 攻击场景：普通用户尝试访问仅限管理员的 API 端点

      // 步骤 1: 创建普通用户
      const regularUser = await createTestUser({
        username: `regular_${Date.now()}`,
        role: 'user'
      });

      try {
        // 步骤 2: 生成普通用户的 JWT Token
        const userToken = generateToken({
          id: regularUser.id,
          username: regularUser.username,
          role: 'user'
        });

        // 步骤 3: 尝试访问管理员端点 - 获取所有用户
        const getAllUsersResponse = await request.get(`${API_BASE}/admin/users`, {
          headers: {
            'Authorization': `Bearer ${userToken}`
          }
        });

        // 验证点：API 层 - 权限检查
        // 期望：应该返回 403 Forbidden
        expect(getAllUsersResponse.status()).toBe(403);

        // 步骤 4: 尝试访问管理员端点 - 创建新用户
        const createUserResponse = await request.post(`${API_BASE}/users`, {
          headers: {
            'Authorization': `Bearer ${userToken}`
          },
          data: {
            username: `hacked_${Date.now()}`,
            password: 'Hacked123',
            role: 'admin'
          }
        });

        // 验证点：API 层 - 创建用户权限检查
        expect(createUserResponse.status()).toBe(403);

        // 清理
        await cleanupTestUser(regularUser.id);
      } catch (error) {
        await cleanupTestUser(regularUser.id);
        throw error;
      }
    });

    test('TIER-054: JWT Token 过期后仍可用漏洞', async ({ request }) => {
      // 攻击场景：过期的 JWT Token 仍然可以被接受
      // 注意：这需要在测试环境中设置很短的过期时间

      // 步骤 1: 创建用户
      const user = await createTestUser();

      try {
        // 步骤 2: 生成一个已过期的 Token（需要在测试环境中设置极短的过期时间）
        // 这里模拟 Token 过期场景
        const jwt = await import('jsonwebtoken');
        const expiredToken = jwt.sign(
          { id: user.id, username: user.username, role: user.role },
          process.env.NODE_ENV === 'test' ? 'test-secret-key' : process.env.JWT_SECRET,
          { expiresIn: '-1h' } // 负数表示已过期
        );

        // 步骤 3: 使用过期 Token 访问受保护资源
        const response = await request.get(`${API_BASE}/users/me`, {
          headers: {
            'Authorization': `Bearer ${expiredToken}`
          }
        });

        // 验证点：API 层 - Token 过期检查
        // 期望：应该返回 401 Unauthorized
        expect(response.status()).toBe(401);

        // 清理
        await cleanupTestUser(user.id);
      } catch (error) {
        await cleanupTestUser(user.id);
        throw error;
      }
    });

    test('TIER-055: 会话固定攻击漏洞 - Session ID 可预测性', async ({ request }) => {
      // 攻击场景：检查 Session ID 是否使用强随机数生成

      // 步骤 1: 创建多个会话，检查 Session ID 的随机性
      const user = await createTestUser();
      const sessionIds: string[] = [];

      try {
        // 创建多个会话
        for (let i = 0; i < 10; i++) {
          const session = await createTestSession(user.id);
          sessionIds.push(session.id);
        }

        // 步骤 2: 分析 Session ID 格式
        // UUID v4 格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        // 验证点：安全层 - Session ID 格式检查
        sessionIds.forEach(id => {
          expect(id).toMatch(uuidPattern); // 应该使用 UUID v4
        });

        // 步骤 3: 检查是否有重复的 Session ID
        const uniqueIds = new Set(sessionIds);
        expect(uniqueIds.size).toBe(sessionIds.length); // 所有 Session ID 应该唯一

        // 清理
        await cleanupTestUser(user.id);
      } catch (error) {
        await cleanupTestUser(user.id);
        throw error;
      }
    });
  });

  // ============================================================================
  // 类别 B: 资源滥用漏洞 (TIER-061 ~ TIER-065)
  // ============================================================================

  test.describe('资源滥用漏洞', () => {
    let testUser: any;

    test.beforeEach(async () => {
      testUser = await createTestUser({ credits: 1000 });
    });

    test.afterEach(async () => {
      if (testUser?.id) {
        await cleanupTestUser(testUser.id);
      }
    });

    test('TIER-061: 超出并发限制漏洞 - 用户可以创建无限数量的会话', async ({ request }) => {
      // 攻击场景：用户创建大量会话，耗尽系统资源

      const sessionIds: string[] = [];
      const maxConcurrentSessions = 100; // 尝试创建 100 个会话

      try {
        // 步骤 1: 批量创建会话
        for (let i = 0; i < maxConcurrentSessions; i++) {
          const response = await request.post(`${API_BASE}/sessions`, {
            headers: {
              'x-api-key': testUser.api_key
            },
            data: {
              viewport: { width: 1920, height: 1080 }
            }
          });

          // 如果请求失败，停止创建
          if (response.status() !== 201) {
            break;
          }

          const data = await response.json();
          sessionIds.push(data.data.id);
        }

        // 验证点：API 层 - 并发限制检查
        // 期望：系统应该限制单个用户的并发会话数
        // 实际：可能没有限制，导致资源耗尽
        expect(sessionIds.length).toBeLessThan(50); // 假设合理限制为 50

        // 验证点：数据库层 - 检查实际创建的会话数
        const userSessions = await db('sessions').where({ user_id: testUser.id }).whereNotNull('machine_id');
        expect(userSessions.length).toBeLessThan(50);

      } finally {
        // 清理：释放所有创建的会话
        for (const sessionId of sessionIds) {
          await request.post(`${API_BASE}/sessions/${sessionId}/release`, {
            headers: { 'x-api-key': testUser.api_key }
          });
        }
      }
    });

    test('TIER-062: 积分扣费绕过漏洞 - 并发创建会话导致重复扣费或漏扣费', async ({ request }) => {
      // 攻击场景：通过并发请求利用竞态条件绕过积分检查

      // 步骤 1: 将用户积分设置为刚好够创建 1 个会话
      await db('users').where({ id: testUser.id }).update({ credits: 1 });

      // 步骤 2: 并发发送多个创建会话请求
      const concurrentRequests = 5;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request.post(`${API_BASE}/sessions`, {
            headers: { 'x-api-key': testUser.api_key },
            data: { viewport: { width: 1920, height: 1080 } }
          })
        );
      }

      // 步骤 3: 等待所有请求完成
      const responses = await Promise.all(promises);

      // 统计成功创建的会话数
      const successCount = responses.filter(r => r.status() === 201).length;

      // 验证点：业务层 - 积分扣费一致性
      // 期望：只应该创建 1 个会话（积分只够 1 个）
      // 实际：如果存在竞态条件，可能创建多个会话
      expect(successCount).toBe(1);

      // 验证点：数据库层 - 检查用户积分
      const user = await db('users').where({ id: testUser.id }).first();
      expect(user.credits).toBe(0); // 积分应该为 0
      expect(user.credits).toBeGreaterThanOrEqual(0); // 积分不应该为负数
    });

    test('TIER-063: 负数积分漏洞 - 用户积分可以变为负数', async ({ request }) => {
      // 攻击场景：通过某种方式使用户积分变为负数

      // 步骤 1: 将用户积分设置为 0
      await db('users').where({ id: testUser.id }).update({ credits: 0 });

      // 步骤 2: 尝试创建会话（应该失败，因为积分不足）
      const response = await request.post(`${API_BASE}/sessions`, {
        headers: { 'x-api-key': testUser.api_key },
        data: { viewport: { width: 1920, height: 1080 } }
      });

      // 验证点：API 层 - 积分不足检查
      expect(response.status()).toBe(400); // 应该返回 400 Bad Request

      // 验证点：数据库层 - 积分不应该为负数
      const user = await db('users').where({ id: testUser.id }).first();
      expect(user.credits).toBe(0);
      expect(user.credits).toBeGreaterThanOrEqual(0);
    });

    test('TIER-064: 无限会话创建漏洞 - 不扣除积分的会话创建', async ({ request }) => {
      // 攻击场景：通过某些方式创建会话但不扣除积分

      // 步骤 1: 记录初始积分
      const initialCredits = (await db('users').where({ id: testUser.id }).first()).credits;

      // 步骤 2: 尝试创建会话
      const response = await request.post(`${API_BASE}/sessions`, {
        headers: { 'x-api-key': testUser.api_key },
        data: { viewport: { width: 1920, height: 1080 } }
      });

      if (response.status() === 201) {
        const sessionData = await response.json();

        // 步骤 3: 立即释放会话
        await request.post(`${API_BASE}/sessions/${sessionData.data.id}/release`, {
          headers: { 'x-api-key': testUser.api_key }
        });

        // 步骤 4: 检查积分是否正确扣除
        const user = await db('users').where({ id: testUser.id }).first();

        // 验证点：业务层 - 积分扣费
        // 期望：积分应该减少
        // 实际：可能没有扣费
        expect(user.credits).toBeLessThan(initialCredits);

        // 步骤 5: 检查积分历史记录
        const creditHistory = await db('credit_history')
          .where({ user_id: testUser.id })
          .orderBy('created_at', 'desc')
          .first();

        // 验证点：数据库层 - 积分历史记录
        expect(creditHistory).toBeTruthy();
        expect(creditHistory.action).toBe('use');
      } else {
        // 如果会话创建失败，跳过此测试
        test.skip();
      }
    });

    test('TIER-065: 机器资源耗尽漏洞 - 创建会话导致机器实例计数溢出', async ({ request }) => {
      // 攻击场景：创建会话时不检查机器容量，导致实例计数超出限制

      // 步骤 1: 获取一台机器
      const machine = await db('machines').where({ status: 'online' }).first();

      if (!machine) {
        test.skip(); // 没有可用的机器
        return;
      }

      // 步骤 2: 记录机器的初始实例计数
      const initialInstanceCount = machine.instance_count || 0;
      const maxInstances = machine.max_instances || 10;

      // 步骤 3: 尝试创建会话直到达到机器容量上限
      const sessionIds: string[] = [];

      try {
        for (let i = 0; i < maxInstances + 5; i++) {
          // 直接在数据库中创建会话记录，绕过 API 层检查
          const sessionId = uuidv4();
          await db('sessions').insert({
            id: sessionId,
            user_id: testUser.id,
            machine_id: machine.id,
            port: 9000 + i,
            status: 'created',
            start_time: new Date(),
            created_at: new Date(),
            updated_at: new Date()
          });

          // 增加机器实例计数
          await db('machines').where({ id: machine.id }).increment('instance_count', 1);

          sessionIds.push(sessionId);
        }

        // 步骤 4: 检查机器实例计数
        const updatedMachine = await db('machines').where({ id: machine.id }).first();
        const finalInstanceCount = updatedMachine.instance_count || 0;

        // 验证点：数据库层 - 机器容量限制
        // 期望：实例计数不应该超过 max_instances
        // 实际：可能没有限制，导致溢出
        expect(finalInstanceCount).toBeLessThanOrEqual(maxInstances);

      } finally {
        // 清理：删除所有创建的会话
        for (const sessionId of sessionIds) {
          await db('sessions').where({ id: sessionId }).delete();
        }

        // 恢复机器实例计数
        await db('machines').where({ id: machine.id }).update({
          instance_count: initialInstanceCount
        });
      }
    });
  });

  // ============================================================================
  // 类别 C: 业务逻辑漏洞 (TIER-041 ~ TIER-045)
  // ============================================================================

  test.describe('业务逻辑漏洞', () => {
    let testUser: any;

    test.beforeEach(async () => {
      testUser = await createTestUser({ credits: 100 });
    });

    test.afterEach(async () => {
      if (testUser?.id) {
        await cleanupTestUser(testUser.id);
      }
    });

    test('TIER-041: 并发竞态条件漏洞 - 同时释放会话导致重复扣费', async ({ request }) => {
      // 攻击场景：多次并发调用释放会话接口，利用竞态条件重复扣费

      // 步骤 1: 创建会话
      const session = await createTestSession(testUser.id, {
        status: 'connected',
        start_time: new Date(Date.now() - 120000) // 2 分钟前开始
      });

      // 步骤 2: 记录初始积分
      const initialCredits = (await db('users').where({ id: testUser.id }).first()).credits;

      // 步骤 3: 并发发送多个释放会话请求
      const concurrentRequests = 5;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request.post(`${API_BASE}/sessions/${session.id}/release`, {
            headers: { 'x-api-key': testUser.api_key }
          })
        );
      }

      // 步骤 4: 等待所有请求完成
      const responses = await Promise.all(promises);

      // 步骤 5: 检查最终积分
      const finalUser = await db('users').where({ id: testUser.id }).first();
      const finalCredits = finalUser.credits;

      // 验证点：业务层 - 积分扣费幂等性
      // 期望：只扣费一次（2 分钟 = 2 点）
      // 实际：如果存在竞态条件，可能扣费多次
      const expectedDeduction = 2; // 2 分钟 = 2 点
      const actualDeduction = initialCredits - finalCredits;

      expect(actualDeduction).toBe(expectedDeduction); // 应该只扣 2 点
      expect(actualDeduction).toBeLessThanOrEqual(expectedDeduction); // 不应该扣超过 2 点
    });

    test('TIER-042: 会话状态不一致漏洞 - 会话状态与实际不符', async ({ request }) => {
      // 攻击场景：会话状态与机器实例状态不一致

      // 步骤 1: 创建会话并设置为 connected 状态
      const session = await createTestSession(testUser.id, {
        status: 'connected',
        machine_id: 'test-machine-1',
        port: 9000,
        start_time: new Date()
      });

      // 步骤 2: 手动将会话状态改为 disconnected
      await db('sessions').where({ id: session.id }).update({
        status: 'disconnected',
        end_time: new Date(),
        duration: 60,
        credits_used: 1
      });

      // 步骤 3: 尝试再次释放会话
      const response = await request.post(`${API_BASE}/sessions/${session.id}/release`, {
        headers: { 'x-api-key': testUser.api_key }
      });

      // 验证点：API 层 - 状态检查
      // 期望：应该返回会话已释放的提示
      // 实际：可能重复扣费
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.data.status).toBe('disconnected');

      // 验证点：数据库层 - 检查积分是否重复扣除
      const user = await db('users').where({ id: testUser.id }).first();
      expect(user.credits).toBeGreaterThanOrEqual(0);
    });

    test('TIER-043: 时间窗口利用漏洞 - 在计费周期结束前创建大量会话', async ({ request }) => {
      // 攻击场景：在会话即将到期前创建新会话，避开扣费

      // 步骤 1: 创建一个即将到期的会话（59 秒）
      const session = await createTestSession(testUser.id, {
        status: 'connected',
        start_time: new Date(Date.now() - 59000), // 59 秒前开始
        credits_used: 0
      });

      // 步骤 2: 在会话即将达到 1 分钟时释放
      await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒

      await request.post(`${API_BASE}/sessions/${session.id}/release`, {
        headers: { 'x-api-key': testUser.api_key }
      });

      // 步骤 3: 检查扣费情况
      const updatedSession = await db('sessions').where({ id: session.id }).first();

      // 验证点：业务层 - 计费逻辑
      // 期望：60 秒应该扣 1 点
      // 实际：可能向上取整导致扣 2 点
      expect(updatedSession.credits_used).toBe(1); // 60 秒 = 1 点
    });

    test('TIER-044: 积分历史记录不一致漏洞 - 会话扣费但无历史记录', async ({ request }) => {
      // 攻击场景：积分被扣除但没有创建历史记录

      // 步骤 1: 创建会话
      const session = await createTestSession(testUser.id, {
        status: 'connected',
        start_time: new Date(Date.now() - 120000)
      });

      // 步骤 2: 释放会话
      await request.post(`${API_BASE}/sessions/${session.id}/release`, {
        headers: { 'x-api-key': testUser.api_key }
      });

      // 步骤 3: 检查积分历史记录
      const creditHistory = await db('credit_history')
        .where({ user_id: testUser.id })
        .orderBy('created_at', 'desc')
        .first();

      // 验证点：数据库层 - 积分历史记录完整性
      expect(creditHistory).toBeTruthy();
      expect(creditHistory.action).toBe('use');
      expect(creditHistory.amount).toBeGreaterThan(0);
    });

    test('TIER-045: 机器实例计数不一致漏洞 - 会话已删除但机器计数未减少', async () => {
      // 攻击场景：会话被删除但机器实例计数未同步更新

      // 步骤 1: 获取一台机器
      const machine = await db('machines').where({ status: 'online' }).first();

      if (!machine) {
        test.skip();
        return;
      }

      // 步骤 2: 记录初始实例计数
      const initialCount = machine.instance_count || 0;

      // 步骤 3: 创建会话并增加实例计数
      await db('machines').where({ id: machine.id }).increment('instance_count', 1);

      // 步骤 4: 直接删除会话（不通过正常流程）
      const session = await createTestSession(testUser.id, {
        machine_id: machine.id,
        status: 'connected'
      });

      await db('sessions').where({ id: session.id }).delete();

      // 步骤 5: 检查机器实例计数
      const updatedMachine = await db('machines').where({ id: machine.id }).first();
      const finalCount = updatedMachine.instance_count || 0;

      // 验证点：数据库层 - 计数一致性
      // 期望：实例计数应该减少
      // 实际：可能没有减少，导致计数不准确
      expect(finalCount).toBe(initialCount); // 应该回到初始值

      // 清理：恢复计数
      await db('machines').where({ id: machine.id }).update({
        instance_count: initialCount
      });
    });
  });

  // ============================================================================
  // 类别 D: 数据安全漏洞 (TIER-071 ~ TIER-075)
  // ============================================================================

  test.describe('数据安全漏洞', () => {
    let userA: any;
    let userB: any;

    test.beforeEach(async () => {
      userA = await createTestUser({ username: `userA_${Date.now()}` });
      userB = await createTestUser({ username: `userB_${Date.now()}` });
    });

    test.afterEach(async () => {
      if (userA?.id) await cleanupTestUser(userA.id);
      if (userB?.id) await cleanupTestUser(userB.id);
    });

    test('TIER-071: 越权访问他人会话漏洞 - 枚举 Session ID 访问其他用户会话', async ({ request }) => {
      // 攻击场景：用户 A 通过枚举 Session ID 尝试访问用户 B 的会话

      // 步骤 1: 用户 B 创建会话
      const userBSession = await createTestSession(userB.id, {
        status: 'connected'
      });

      // 步骤 2: 用户 A 尝试访问用户 B 的会话
      const response = await request.get(`${API_BASE}/sessions/${userBSession.id}`, {
        headers: { 'x-api-key': userA.api_key }
      });

      // 验证点：API 层 - 访问控制
      // 期望：返回 403 Forbidden
      expect(response.status()).toBe(403);

      // 步骤 3: 尝试释放用户 B 的会话
      const releaseResponse = await request.post(`${API_BASE}/sessions/${userBSession.id}/release`, {
        headers: { 'x-api-key': userA.api_key }
      });

      // 验证点：API 层 - 操作权限检查
      expect(releaseResponse.status()).toBe(403);
    });

    test('TIER-072: 越权访问他人积分信息漏洞 - 获取其他用户的积分详情', async ({ request }) => {
      // 攻击场景：用户 A 尝试获取用户 B 的积分信息

      // 步骤 1: 用户 A 尝试访问用户 B 的用户信息
      const response = await request.get(`${API_BASE}/users/${userB.id}`, {
        headers: {
          'Authorization': `Bearer ${generateToken({
            id: userA.id,
            username: userA.username,
            role: 'user'
          })}`
        }
      });

      // 验证点：API 层 - 权限检查
      // 期望：返回 403 Forbidden（普通用户不能访问其他用户信息）
      // 实际：可能需要管理员权限
      expect([403, 401]).toContain(response.status());
    });

    test('TIER-073: 敏感信息泄露漏洞 - API 响应包含敏感信息', async ({ request }) => {
      // 攻击场景：检查 API 响应是否泄露敏感信息

      // 步骤 1: 获取当前用户信息
      const response = await request.get(`${API_BASE}/users/me`, {
        headers: { 'x-api-key': userA.api_key }
      });

      expect(response.status()).toBe(200);

      const data = await response.json();

      // 验证点：API 层 - 敏感信息过滤
      // 检查是否包含密码哈希
      expect(data.data).not.toHaveProperty('password');

      // 检查是否包含 API Key（允许返回，但应该有保护）
      // API Key 可以返回，因为用户需要它来调用 API

      // 检查是否包含其他敏感信息
      expect(data.data).toHaveProperty('id');
      expect(data.data).toHaveProperty('username');
      expect(data.data).toHaveProperty('credits');
    });

    test('TIER-074: SQL 注入尝试漏洞 - 通过输入参数尝试 SQL 注入', async ({ request }) => {
      // 攻击场景：尝试通过输入参数进行 SQL 注入

      const sqlInjectionPayloads = [
        "1' OR '1'='1",
        "1' UNION SELECT * FROM users--",
        "'; DROP TABLE users--",
        "1' AND 1=1--",
        "admin'--"
      ];

      for (const payload of sqlInjectionPayloads) {
        // 步骤 1: 尝试通过用户 ID 参数注入
        const response = await request.get(`${API_BASE}/users/${encodeURIComponent(payload)}`, {
          headers: {
            'Authorization': `Bearer ${generateToken({
              id: userA.id,
              username: userA.username,
              role: 'admin'
            })}`
          }
        });

        // 验证点：API 层 - SQL 注入防护
        // 期望：返回 400 Bad Request 或 404 Not Found
        // 不应该返回 200 OK（除非真的找到了用户）
        expect([400, 404, 403]).toContain(response.status());

        // 如果返回 200，检查是否有意外的数据泄露
        if (response.status() === 200) {
          const data = await response.json();
          // 不应该返回所有用户的数据
          if (data.data) {
            expect(data.data.id).not.toBeUndefined();
          }
        }
      }
    });

    test('TIER-075: 会话劫持漏洞 - 通过 Session ID 劫持会话', async ({ request }) => {
      // 攻击场景：攻击者获取到会话 ID 后，直接访问该会话

      // 步骤 1: 用户 B 创建会话
      const userBSession = await createTestSession(userB.id, {
        status: 'connected',
        machine_id: 'test-machine-1',
        port: 9000
      });

      // 步骤 2: 攻击者（用户 A）尝试直接使用会话 ID
      const response = await request.get(`${API_BASE}/sessions/${userBSession.id}`, {
        headers: { 'x-api-key': userA.api_key }
      });

      // 验证点：API 层 - 会话归属检查
      // 期望：返回 403 Forbidden
      expect(response.status()).toBe(403);

      // 步骤 3: 检查是否可以获取会话截图
      const screenshotResponse = await request.get(`${API_BASE}/sessions/${userBSession.id}/screenshot`, {
        headers: { 'x-api-key': userA.api_key }
      });

      // 验证点：API 层 - 截图访问控制
      expect([403, 404]).toContain(screenshotResponse.status());
    });
  });
});
