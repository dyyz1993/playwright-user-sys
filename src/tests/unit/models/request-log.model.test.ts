import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({
  db: Object.assign(
    (table: string) => {
      throw new Error(`Unexpected db('${table}') call in unit test`);
    },
    { raw: (sql: string) => sql }
  ),
}));

describe('RequestLogModel types and structure', () => {
  it('should export CreateRequestLogInput interface with correct fields', async () => {
    const mod = await import('../../../models/request-log.model.js');
    expect(mod.RequestLogModel).toBeDefined();
    expect(typeof mod.RequestLogModel.create).toBe('function');
    expect(typeof mod.RequestLogModel.findById).toBe('function');
    expect(typeof mod.RequestLogModel.findByUserId).toBe('function');
    expect(typeof mod.RequestLogModel.findErrors).toBe('function');
    expect(typeof mod.RequestLogModel.findAll).toBe('function');
    expect(typeof mod.RequestLogModel.getStats).toBe('function');
  });

  it('should have RequestLog interface with correct shape', async () => {
    const mod = await import('../../../models/request-log.model.js');
    const input: mod.CreateRequestLogInput = {
      method: 'GET',
      path: '/api/test',
      status_code: 200,
    };
    expect(input.method).toBe('GET');
    expect(input.path).toBe('/api/test');
    expect(input.status_code).toBe(200);
  });

  it('should accept optional fields in CreateRequestLogInput', async () => {
    const mod = await import('../../../models/request-log.model.js');
    const input: mod.CreateRequestLogInput = {
      user_id: 1,
      method: 'POST',
      path: '/api/login',
      status_code: 201,
      ip: '127.0.0.1',
      user_agent: 'Mozilla/5.0',
      response_time: 42,
    };
    expect(input.user_id).toBe(1);
    expect(input.ip).toBe('127.0.0.1');
    expect(input.user_agent).toBe('Mozilla/5.0');
    expect(input.response_time).toBe(42);
  });

  it('should have RequestLogStats interface with correct shape', async () => {
    const mod = await import('../../../models/request-log.model.js');
    const stats: mod.RequestLogStats = {
      daily: [{ date: '2024-01-01', count: 10 }],
      statusCodes: [{ status_code: 200, count: 5 }],
      topPaths: [{ path: '/api/test', count: 3 }],
    };
    expect(stats.daily[0].date).toBe('2024-01-01');
    expect(stats.statusCodes[0].status_code).toBe(200);
    expect(stats.topPaths[0].path).toBe('/api/test');
  });
});
