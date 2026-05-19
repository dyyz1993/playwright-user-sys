import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '../../../../shared/types/index.js';

function createMockFastify(userRole?: string, verifySucceeds = true) {
  const reply: Record<string, ReturnType<typeof vi.fn>> = {
    sent: false,
    statusCode: 200,
    status: vi.fn(function (this: Record<string, unknown>, code: number) {
      this.statusCode = code;
      return this;
    }),
    send: vi.fn(function (this: Record<string, unknown>) {
      this.sent = true;
      return this;
    }),
  };

  const request: Record<string, unknown> = {
    user: userRole ? { id: 1, role: userRole } : undefined,
    log: { error: vi.fn() },
  };

  const fastify: Record<string, unknown> = {
    verifyJWT: vi.fn(async () => {
      if (!verifySucceeds) throw new Error('JWT verify failed');
    }),
  };

  return { reply, request, fastify };
}

describe('createAuthenticate', () => {
  let createAuthenticate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../../routes/admin-api/authenticate.js');
    createAuthenticate = mod.createAuthenticate;
  });

  it('should return 401 when user is not set after JWT verification', async () => {
    const { fastify, request, reply } = createMockFastify(undefined, true);

    const authenticate = createAuthenticate(fastify);
    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: '未授权' });
  });

  it('should return 403 when user role is not admin', async () => {
    const { fastify, request, reply } = createMockFastify(UserRole.USER, true);

    const authenticate = createAuthenticate(fastify);
    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: '需要管理员权限' });
  });

  it('should pass when user is admin', async () => {
    const { fastify, request, reply } = createMockFastify(UserRole.ADMIN, true);

    const authenticate = createAuthenticate(fastify);
    await authenticate(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('should return 401 when JWT verification throws', async () => {
    const { fastify, request, reply } = createMockFastify(undefined, false);

    const authenticate = createAuthenticate(fastify);
    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: '认证失败' });
  });

  it('should skip processing when reply already sent', async () => {
    const { fastify, request, reply } = createMockFastify(UserRole.ADMIN, true);
    reply.sent = true;

    const authenticate = createAuthenticate(fastify);
    await authenticate(request, reply);

    expect(fastify.verifyJWT).not.toHaveBeenCalled();
  });

  it('should skip processing when reply sent after verifyJWT', async () => {
    const { fastify, request, reply } = createMockFastify(undefined, true);

    const fastifyWithSentReply = {
      ...fastify,
      verifyJWT: vi.fn(async () => {
        reply.sent = true;
      }),
    };

    const authenticate = createAuthenticate(fastifyWithSentReply);
    await authenticate(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});
