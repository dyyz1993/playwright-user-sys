import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tryCatchWrapper } from '../../../utils/try-catch-wrapper.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

function createMockRequest(logError?: ReturnType<typeof vi.fn>): FastifyRequest {
  return {
    log: {
      error: logError ?? vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as FastifyRequest;
}

function createMockReply(): {
  reply: FastifyReply;
  statusCode: number;
  body: unknown;
} {
  const state = { statusCode: 0, body: undefined as unknown };
  const reply = {
    status(code: number) {
      state.statusCode = code;
      return reply;
    },
    send(data: unknown) {
      state.body = data;
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, statusCode: state.statusCode, body: state.body };
}

function getState(mockReply: ReturnType<typeof createMockReply>) {
  return {
    get statusCode() {
      return (mockReply.reply as unknown as { _statusCode?: number })._statusCode ?? 0;
    },
  };
}

describe('tryCatchWrapper', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should pass through when handler succeeds', async () => {
    const logError = vi.fn();
    const request = createMockRequest(logError);
    const { reply } = createMockReply();

    let handlerCalled = false;
    const wrapped = tryCatchWrapper(async (_req, _rep) => {
      handlerCalled = true;
    });

    await wrapped(request, reply);

    expect(handlerCalled).toBe(true);
    expect(logError).not.toHaveBeenCalled();
  });

  it('should return 500 with safe error message when handler throws Error', async () => {
    process.env.NODE_ENV = 'development';
    const logError = vi.fn();
    const request = createMockRequest(logError);

    let capturedStatus = 0;
    let capturedBody: unknown = null;
    const reply = {
      status(code: number) {
        capturedStatus = code;
        return reply;
      },
      send(data: unknown) {
        capturedBody = data;
        return reply;
      },
    } as unknown as FastifyReply;

    const wrapped = tryCatchWrapper(async () => {
      throw new Error('database connection failed');
    });

    await wrapped(request, reply);

    expect(logError).toHaveBeenCalledWith({ error: expect.any(Error) }, 'Route handler error');
    expect(capturedStatus).toBe(500);
    expect(capturedBody).toEqual({
      success: false,
      error: 'database connection failed',
    });
  });

  it('should return 500 with generic message when non-Error is thrown', async () => {
    process.env.NODE_ENV = 'development';
    const logError = vi.fn();
    const request = createMockRequest(logError);

    let capturedStatus = 0;
    let capturedBody: unknown = null;
    const reply = {
      status(code: number) {
        capturedStatus = code;
        return reply;
      },
      send(data: unknown) {
        capturedBody = data;
        return reply;
      },
    } as unknown as FastifyReply;

    const wrapped = tryCatchWrapper(async () => {
      throw 'string error';
    });

    await wrapped(request, reply);

    expect(capturedStatus).toBe(500);
    expect(capturedBody).toEqual({
      success: false,
      error: 'string error',
    });
  });

  it('should return generic message in production environment', async () => {
    process.env.NODE_ENV = 'production';
    const logError = vi.fn();
    const request = createMockRequest(logError);

    let capturedStatus = 0;
    let capturedBody: unknown = null;
    const reply = {
      status(code: number) {
        capturedStatus = code;
        return reply;
      },
      send(data: unknown) {
        capturedBody = data;
        return reply;
      },
    } as unknown as FastifyReply;

    const wrapped = tryCatchWrapper(async () => {
      throw new Error('secret database credentials exposed');
    });

    await wrapped(request, reply);

    expect(capturedStatus).toBe(500);
    expect(capturedBody).toEqual({
      success: false,
      error: '服务器内部错误',
    });
  });

  it('should return actual error message in development environment', async () => {
    process.env.NODE_ENV = 'development';
    const logError = vi.fn();
    const request = createMockRequest(logError);

    let capturedBody: unknown = null;
    const reply = {
      status(_code: number) {
        return reply;
      },
      send(data: unknown) {
        capturedBody = data;
        return reply;
      },
    } as unknown as FastifyReply;

    const wrapped = tryCatchWrapper(async () => {
      throw new Error('specific dev error details');
    });

    await wrapped(request, reply);

    expect(capturedBody).toEqual({
      success: false,
      error: 'specific dev error details',
    });
  });

  it('should call request.log.error with error context', async () => {
    const logError = vi.fn();
    const request = createMockRequest(logError);
    const { reply } = createMockReply();

    const thrownError = new Error('test error');
    const wrapped = tryCatchWrapper(async () => {
      throw thrownError;
    });

    await wrapped(request, reply);

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith({ error: expect.any(Error) }, 'Route handler error');
    const loggedError = logError.mock.calls[0][0].error;
    expect(loggedError).toBe(thrownError);
  });

  it('should handle async handler that resolves successfully', async () => {
    const logError = vi.fn();
    const request = createMockRequest(logError);

    let replyStatus = 0;
    let replyBody: unknown = null;
    const reply = {
      status(code: number) {
        replyStatus = code;
        return reply;
      },
      send(data: unknown) {
        replyBody = data;
        return reply;
      },
    } as unknown as FastifyReply;

    const wrapped = tryCatchWrapper(async (_req, rep) => {
      rep.status(200).send({ success: true, data: 'ok' });
    });

    await wrapped(request, reply);

    expect(replyStatus).toBe(200);
    expect(replyBody).toEqual({ success: true, data: 'ok' });
    expect(logError).not.toHaveBeenCalled();
  });
});
