import { FastifyReply } from 'fastify';
import { ApiResponse, PaginatedResponse } from '@shared/types/index.js';

// 成功响应
export function success<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
  };
}

// 错误响应
export function error(message: string, _statusCode: number = 400): ApiResponse {
  return {
    success: false,
    error: message, // 使用 "error" 字段而不是 "message" 以匹配 errorResponseSchema
  };
}

// 发送成功响应
export function sendSuccess<T>(reply: FastifyReply, data: T, message?: string, statusCode: number = 200): FastifyReply {
  return reply.status(statusCode).send(success(data, message));
}

// 发送错误响应
export function sendError(reply: FastifyReply, message: string, statusCode: number = 400): FastifyReply {
  return reply.status(statusCode).send(error(message, statusCode));
}

// 发送分页响应
export function sendPaginated<T>(reply: FastifyReply, data: PaginatedResponse<T>): FastifyReply {
  return reply.status(200).send(success(data));
}

// 发送创建成功响应
export function sendCreated<T>(reply: FastifyReply, data: T, message?: string): FastifyReply {
  return sendSuccess(reply, data, message, 201);
}

// 发送无内容响应
export function sendNoContent(reply: FastifyReply): FastifyReply {
  return reply.status(204).send();
}

export function logAndSendError(
  request: { log: { error: (_err: unknown) => void } },
  reply: FastifyReply,
  error: unknown,
  message: string,
  statusCode: number = 500
): FastifyReply {
  request.log.error(error);
  return sendError(reply, message, statusCode);
}

export function getSafeErrorMessage(error: unknown): string {
  if (process.env.NODE_ENV === 'production') {
    return '服务器内部错误';
  }
  return error instanceof Error ? error.message : String(error);
}

export default {
  success,
  error,
  sendSuccess,
  sendError,
  sendPaginated,
  sendCreated,
  sendNoContent,
  logAndSendError,
  getSafeErrorMessage,
};
