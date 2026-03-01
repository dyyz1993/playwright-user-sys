import { describe, test, expect } from 'vitest';
import { success, error } from '../../utils/response.js';

describe('响应工具函数测试', () => {
  // 测试成功响应格式
  test('success函数应该返回正确的响应格式', () => {
    const data = { id: 1, name: 'test' };
    const message = '操作成功';

    const response = success(data, message);

    expect(response).toEqual({
      success: true,
      data,
      message,
    });
  });

  // 测试不带消息的成功响应
  test('success函数不带消息应该返回正确的响应格式', () => {
    const data = { id: 1, name: 'test' };

    const response = success(data);

    expect(response).toEqual({
      success: true,
      data,
    });
  });

  // 测试错误响应格式
  test('error函数应该返回正确的响应格式', () => {
    const message = '操作失败';
    const statusCode = 400;

    const response = error(message, statusCode);

    expect(response).toEqual({
      success: false,
      error: message,
    });
  });

  // 测试默认状态码的错误响应
  test('error函数使用默认状态码应该返回正确的响应格式', () => {
    const message = '操作失败';

    const response = error(message);

    expect(response).toEqual({
      success: false,
      error: message,
    });
  });
});
