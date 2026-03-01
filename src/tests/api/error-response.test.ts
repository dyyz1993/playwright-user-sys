import { describe, beforeAll, afterAll, test, expect } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';
import { initDatabase } from '../../config/database.js';
import { clearAllTables } from '../helpers/database.js';
import { UserModel } from '../../models/user.model.js';
import { generateToken, hashPassword } from '../../utils/auth.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

describe('错误响应格式测试', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;
  let testUserId: number;

  beforeAll(async () => {
    await initDatabase();
    await clearAllTables();

    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  test('未授权访问应返回正确的错误响应格式', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me',
    });

    const result = JSON.parse(response.payload);

    expect(response.statusCode).toBe(401);
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
  });

  test('资源不存在应返回正确的错误响应格式', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/99999',
    });

    const result = JSON.parse(response.payload);

    expect(response.statusCode).toBe(401);
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
  });

  test('无效请求应返回正确的错误响应格式', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
    });

    const result = JSON.parse(response.payload);

    expect(response.statusCode).toBe(400);
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
  });
});
