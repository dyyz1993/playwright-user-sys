/**
 * 自定义错误类 — 提供结构化错误信息，替代内联状态码
 */

/** 基础应用错误 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** 资源未找到 (404) */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    const message = id ? `${resource}不存在: ${id}` : `${resource}不存在`;
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/** 验证错误 (400) */
export class ValidationError extends AppError {
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details;
  }
}

/** 认证错误 (401) */
export class AuthenticationError extends AppError {
  constructor(message: string = '认证失败') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

/** 授权错误 (403) */
export class AuthorizationError extends AppError {
  constructor(message: string = '权限不足') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

/** 判断是否为 AppError 实例 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
