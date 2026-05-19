import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  successResponseSchema,
  errorResponseSchema,
  adminLoginRequestSchema,
  adminCreateUserRequestSchema,
  adminUpdateUserRequestSchema,
  adminAddCreditsRequestSchema,
  userListQuerySchema,
  loginRequestSchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  addCreditsRequestSchema,
  registerMachineRequestSchema,
  updateMachineStatusRequestSchema,
  batchOperationRequestSchema,
  createSessionRequestSchema,
  injectFileRequestSchema,
  uploadUrlRequestSchema,
} from '../../../schemas/index.js';

describe('successResponseSchema', () => {
  it('should validate with inline schema', () => {
    const schema = successResponseSchema(z.object({ id: z.number() }));
    expect(schema.parse({ success: true, data: { id: 1 } })).toEqual({
      success: true,
      data: { id: 1 },
    });
  });

  it('should accept optional message', () => {
    const schema = successResponseSchema(z.object({ id: z.number() }));
    expect(schema.parse({ success: true, data: { id: 1 }, message: 'ok' })).toEqual({
      success: true,
      data: { id: 1 },
      message: 'ok',
    });
  });

  it('should reject missing success field', () => {
    const schema = successResponseSchema(z.object({ id: z.number() }));
    expect(() => schema.parse({ data: { id: 1 } })).toThrow();
  });
});

describe('errorResponseSchema', () => {
  it('should accept valid error response', () => {
    const result = errorResponseSchema.parse({ success: false, error: 'Something went wrong' });
    expect(result).toEqual({ success: false, error: 'Something went wrong' });
  });

  it('should reject missing error field', () => {
    expect(() => errorResponseSchema.parse({ success: false })).toThrow();
  });
});

describe('adminLoginRequestSchema', () => {
  it('should accept valid login request', () => {
    const result = adminLoginRequestSchema.parse({ username: 'admin', password: 'secret' });
    expect(result).toEqual({ username: 'admin', password: 'secret' });
  });

  it('should reject empty username', () => {
    expect(() => adminLoginRequestSchema.parse({ username: '', password: 'secret' })).toThrow();
  });

  it('should reject empty password', () => {
    expect(() => adminLoginRequestSchema.parse({ username: 'admin', password: '' })).toThrow();
  });

  it('should reject username over 50 chars', () => {
    expect(() => adminLoginRequestSchema.parse({ username: 'a'.repeat(51), password: 'secret' })).toThrow();
  });
});

describe('adminCreateUserRequestSchema', () => {
  const validUser = {
    username: 'testuser',
    password: 'Pass1234',
  };

  it('should accept valid user with minimal fields', () => {
    const result = adminCreateUserRequestSchema.parse(validUser);
    expect(result.username).toBe('testuser');
  });

  it('should accept user with all optional fields', () => {
    const result = adminCreateUserRequestSchema.parse({
      ...validUser,
      email: 'test@example.com',
      role: 'user',
      credits: 100,
    });
    expect(result.email).toBe('test@example.com');
  });

  it('should reject username shorter than 3 chars', () => {
    expect(() => adminCreateUserRequestSchema.parse({ ...validUser, username: 'ab' })).toThrow();
  });

  it('should reject username with special chars', () => {
    expect(() => adminCreateUserRequestSchema.parse({ ...validUser, username: 'user@name' })).toThrow();
  });

  it('should accept username with Chinese characters', () => {
    expect(() => adminCreateUserRequestSchema.parse({ ...validUser, username: '用户名123' })).not.toThrow();
  });

  it('should reject weak password (no uppercase)', () => {
    expect(() => adminCreateUserRequestSchema.parse({ ...validUser, password: 'pass1234' })).toThrow();
  });

  it('should reject weak password (no lowercase)', () => {
    expect(() => adminCreateUserRequestSchema.parse({ ...validUser, password: 'PASS1234' })).toThrow();
  });

  it('should reject weak password (no digit)', () => {
    expect(() => adminCreateUserRequestSchema.parse({ ...validUser, password: 'Password' })).toThrow();
  });

  it('should reject password shorter than 8 chars', () => {
    expect(() => adminCreateUserRequestSchema.parse({ ...validUser, password: 'Pass12' })).toThrow();
  });

  it('should reject invalid email', () => {
    expect(() => adminCreateUserRequestSchema.parse({ ...validUser, email: 'not-an-email' })).toThrow();
  });

  it('should reject negative credits', () => {
    expect(() => adminCreateUserRequestSchema.parse({ ...validUser, credits: -1 })).toThrow();
  });
});

describe('adminUpdateUserRequestSchema', () => {
  it('should accept empty update (all optional)', () => {
    const result = adminUpdateUserRequestSchema.parse({});
    expect(result).toEqual({});
  });

  it('should accept valid email update', () => {
    const result = adminUpdateUserRequestSchema.parse({ email: 'new@example.com' });
    expect(result.email).toBe('new@example.com');
  });

  it('should reject invalid email', () => {
    expect(() => adminUpdateUserRequestSchema.parse({ email: 'bad' })).toThrow();
  });

  it('should accept valid status update', () => {
    const result = adminUpdateUserRequestSchema.parse({ status: 'inactive' });
    expect(result.status).toBe('inactive');
  });

  it('should reject invalid status', () => {
    expect(() => adminUpdateUserRequestSchema.parse({ status: 'deleted' })).toThrow();
  });

  it('should accept valid webhook_url', () => {
    const result = adminUpdateUserRequestSchema.parse({ webhook_url: 'https://example.com/hook' });
    expect(result.webhook_url).toBe('https://example.com/hook');
  });

  it('should reject invalid webhook_url', () => {
    expect(() => adminUpdateUserRequestSchema.parse({ webhook_url: 'not-a-url' })).toThrow();
  });
});

describe('adminAddCreditsRequestSchema', () => {
  it('should accept valid amount', () => {
    const result = adminAddCreditsRequestSchema.parse({ amount: 100 });
    expect(result.amount).toBe(100);
  });

  it('should accept amount of 1', () => {
    const result = adminAddCreditsRequestSchema.parse({ amount: 1 });
    expect(result.amount).toBe(1);
  });

  it('should reject zero amount', () => {
    expect(() => adminAddCreditsRequestSchema.parse({ amount: 0 })).toThrow();
  });

  it('should reject negative amount', () => {
    expect(() => adminAddCreditsRequestSchema.parse({ amount: -10 })).toThrow();
  });

  it('should reject non-integer amount', () => {
    expect(() => adminAddCreditsRequestSchema.parse({ amount: 1.5 })).toThrow();
  });

  it('should reject amount exceeding 1,000,000', () => {
    expect(() => adminAddCreditsRequestSchema.parse({ amount: 1_000_001 })).toThrow();
  });

  it('should accept amount exactly at 1,000,000', () => {
    const result = adminAddCreditsRequestSchema.parse({ amount: 1_000_000 });
    expect(result.amount).toBe(1_000_000);
  });

  it('should accept optional reason', () => {
    const result = adminAddCreditsRequestSchema.parse({ amount: 100, reason: 'test' });
    expect(result.reason).toBe('test');
  });
});

describe('userListQuerySchema', () => {
  it('should accept empty query', () => {
    const result = userListQuerySchema.parse({});
    expect(result).toEqual({});
  });

  it('should accept valid query params', () => {
    const result = userListQuerySchema.parse({
      page: '1',
      limit: '10',
      sort: 'username',
      order: 'asc',
      search: 'test',
      role: 'admin',
      status: 'active',
    });
    expect(result.page).toBe('1');
  });

  it('should reject invalid sort field', () => {
    expect(() => userListQuerySchema.parse({ sort: 'invalid' })).toThrow();
  });

  it('should reject invalid order', () => {
    expect(() => userListQuerySchema.parse({ order: 'random' })).toThrow();
  });
});

describe('loginRequestSchema', () => {
  it('should accept valid login', () => {
    const result = loginRequestSchema.parse({ username: 'user', password: 'pass' });
    expect(result).toEqual({ username: 'user', password: 'pass' });
  });

  it('should reject empty username', () => {
    expect(() => loginRequestSchema.parse({ username: '', password: 'pass' })).toThrow();
  });

  it('should reject empty password', () => {
    expect(() => loginRequestSchema.parse({ username: 'user', password: '' })).toThrow();
  });
});

describe('createUserRequestSchema', () => {
  const valid = {
    username: 'newuser',
    password: 'Pass1234',
  };

  it('should accept valid user', () => {
    const result = createUserRequestSchema.parse(valid);
    expect(result.username).toBe('newuser');
  });

  it('should reject username with special chars', () => {
    expect(() => createUserRequestSchema.parse({ ...valid, username: 'user!@#' })).toThrow();
  });

  it('should accept username with underscore and hyphen', () => {
    expect(() => createUserRequestSchema.parse({ ...valid, username: 'user_name-123' })).not.toThrow();
  });

  it('should accept nullable webhook_url', () => {
    const result = createUserRequestSchema.parse({ ...valid, webhook_url: null });
    expect(result.webhook_url).toBeNull();
  });
});

describe('updateUserRequestSchema', () => {
  it('should accept empty update', () => {
    const result = updateUserRequestSchema.parse({});
    expect(result).toEqual({});
  });

  it('should accept valid password update', () => {
    expect(() => updateUserRequestSchema.parse({ password: 'NewPass123' })).not.toThrow();
  });

  it('should reject weak password', () => {
    expect(() => updateUserRequestSchema.parse({ password: 'weak' })).toThrow();
  });
});

describe('addCreditsRequestSchema', () => {
  it('should accept valid amount', () => {
    const result = addCreditsRequestSchema.parse({ amount: 50 });
    expect(result.amount).toBe(50);
  });

  it('should reject exceeding max', () => {
    expect(() => addCreditsRequestSchema.parse({ amount: 1_000_001 })).toThrow();
  });
});

describe('registerMachineRequestSchema', () => {
  it('should accept valid machine registration', () => {
    const result = registerMachineRequestSchema.parse({
      id: 'machine-1',
      hostname: 'server1',
      ip: '192.168.1.1',
    });
    expect(result.id).toBe('machine-1');
  });

  it('should reject empty id', () => {
    expect(() => registerMachineRequestSchema.parse({ id: '', hostname: 'server1', ip: '192.168.1.1' })).toThrow();
  });

  it('should reject empty hostname', () => {
    expect(() => registerMachineRequestSchema.parse({ id: 'm1', hostname: '', ip: '192.168.1.1' })).toThrow();
  });

  it('should reject invalid ip', () => {
    expect(() => registerMachineRequestSchema.parse({ id: 'm1', hostname: 's1', ip: 'not-an-ip' })).toThrow();
  });

  it('should accept optional max_instances', () => {
    const result = registerMachineRequestSchema.parse({
      id: 'm1',
      hostname: 's1',
      ip: '10.0.0.1',
      max_instances: 5,
    });
    expect(result.max_instances).toBe(5);
  });
});

describe('updateMachineStatusRequestSchema', () => {
  it('should accept valid status update', () => {
    const result = updateMachineStatusRequestSchema.parse({
      cpuUsage: 50,
      memoryUsage: 60,
      diskUsage: 70,
    });
    expect(result.cpuUsage).toBe(50);
  });

  it('should reject cpuUsage over 100', () => {
    expect(() =>
      updateMachineStatusRequestSchema.parse({
        cpuUsage: 101,
        memoryUsage: 50,
        diskUsage: 50,
      })
    ).toThrow();
  });

  it('should reject negative cpuUsage', () => {
    expect(() =>
      updateMachineStatusRequestSchema.parse({
        cpuUsage: -1,
        memoryUsage: 50,
        diskUsage: 50,
      })
    ).toThrow();
  });

  it('should accept boundary values 0 and 100', () => {
    expect(() =>
      updateMachineStatusRequestSchema.parse({
        cpuUsage: 0,
        memoryUsage: 100,
        diskUsage: 0,
      })
    ).not.toThrow();
  });
});

describe('batchOperationRequestSchema', () => {
  it('should accept valid machine ids', () => {
    const result = batchOperationRequestSchema.parse({ machineIds: ['m1', 'm2'] });
    expect(result.machineIds).toEqual(['m1', 'm2']);
  });

  it('should reject empty array', () => {
    expect(() => batchOperationRequestSchema.parse({ machineIds: [] })).toThrow();
  });

  it('should reject array with empty strings', () => {
    expect(() => batchOperationRequestSchema.parse({ machineIds: [''] })).toThrow();
  });
});

describe('createSessionRequestSchema', () => {
  it('should accept empty body', () => {
    const result = createSessionRequestSchema.parse({});
    expect(result).toEqual({});
  });

  it('should accept valid session options', () => {
    const result = createSessionRequestSchema.parse({
      userAgent: 'Mozilla/5.0',
      viewport: { width: 1920, height: 1080 },
      sharedUserData: true,
    });
    expect(result.userAgent).toBe('Mozilla/5.0');
    expect(result.sharedUserData).toBe(true);
  });

  it('should accept storageState with cookies', () => {
    const result = createSessionRequestSchema.parse({
      storageState: {
        cookies: [{ name: 'sid', value: 'abc', domain: '.example.com', path: '/' }],
      },
    });
    expect(result.storageState?.cookies).toHaveLength(1);
  });

  it('should reject unknown fields in strict mode', () => {
    expect(() => createSessionRequestSchema.parse({ options: {} })).toThrow();
  });

  it('should reject non-positive viewport dimensions', () => {
    expect(() => createSessionRequestSchema.parse({ viewport: { width: 0, height: 100 } })).toThrow();
  });
});

describe('injectFileRequestSchema', () => {
  it('should accept valid request', () => {
    const result = injectFileRequestSchema.parse({
      machineFilePath: '/tmp/file.txt',
      selector: '#input',
    });
    expect(result.machineFilePath).toBe('/tmp/file.txt');
  });

  it('should reject empty machineFilePath', () => {
    expect(() => injectFileRequestSchema.parse({ machineFilePath: '', selector: '#input' })).toThrow();
  });

  it('should reject empty selector', () => {
    expect(() => injectFileRequestSchema.parse({ machineFilePath: '/tmp/f.txt', selector: '' })).toThrow();
  });

  it('should accept optional frameSelector', () => {
    const result = injectFileRequestSchema.parse({
      machineFilePath: '/tmp/f.txt',
      selector: '#input',
      frameSelector: 'iframe',
    });
    expect(result.frameSelector).toBe('iframe');
  });
});

describe('uploadUrlRequestSchema', () => {
  it('should accept valid request', () => {
    const result = uploadUrlRequestSchema.parse({
      url: 'https://example.com/file.pdf',
      selector: '#input',
    });
    expect(result.url).toBe('https://example.com/file.pdf');
  });

  it('should reject invalid url', () => {
    expect(() => uploadUrlRequestSchema.parse({ url: 'not-a-url', selector: '#input' })).toThrow();
  });

  it('should reject empty selector', () => {
    expect(() => uploadUrlRequestSchema.parse({ url: 'https://example.com/file', selector: '' })).toThrow();
  });

  it('should accept optional fields', () => {
    const result = uploadUrlRequestSchema.parse({
      url: 'https://example.com/file',
      selector: '#input',
      filename: 'report.pdf',
      downloadTimeout: 30000,
    });
    expect(result.filename).toBe('report.pdf');
    expect(result.downloadTimeout).toBe(30000);
  });
});
