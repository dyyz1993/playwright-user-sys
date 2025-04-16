import { FastifyInstance } from 'fastify';
import { build } from '../helpers/app.js';

describe('错误响应格式测试', () => {
  let app: FastifyInstance;

  // 在所有测试之前设置应用
  beforeAll(async () => {
    // 构建应用实例
    app = await build();
  });

  // 在所有测试之后关闭应用
  afterAll(async () => {
    await app.close();
  });

  // 测试未授权访问的错误响应格式
  test('未授权访问应返回正确的错误响应格式', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me',
    });

    const result = JSON.parse(response.payload);

    // 验证响应状态码和错误格式
    expect(response.statusCode).toBe(401);
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
  });

  // 测试资源不存在的错误响应格式
  test('资源不存在应返回正确的错误响应格式', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/99999',
    });

    const result = JSON.parse(response.payload);

    // 验证响应状态码和错误格式
    expect(response.statusCode).toBe(401); // 或404，取决于路由实现
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
  });

  // 测试无效请求的错误响应格式
  test('无效请求应返回正确的错误响应格式', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        // 缺少必要字段
      },
    });

    const result = JSON.parse(response.payload);

    // 验证响应状态码和错误格式
    expect(response.statusCode).toBe(400);
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
  });
});
