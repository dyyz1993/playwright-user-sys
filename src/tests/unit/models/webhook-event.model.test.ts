import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookEventType } from '../../../shared/types/index.js';

let mockTable: any;
const mockRaw = vi.fn((sql: string) => sql);

const dbFn = (tableOrMethod: string) => {
  if (tableOrMethod === 'webhook_events') return mockTable;
  return mockTable;
};
dbFn.raw = mockRaw;

vi.mock('../../../config/database.js', () => ({
  db: dbFn,
}));

function createMockChain(finalValue: any) {
  const chain: any = (..._args: any[]) => chain;
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(typeof finalValue === 'function' ? finalValue() : finalValue).then(resolve, reject);
  return chain;
}

describe('WebhookEventModel', () => {
  let WebhookEventModel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../models/webhook-event.model.js');
    WebhookEventModel = mod.WebhookEventModel;
  });

  it('WE-01: 应该成功创建Webhook事件', async () => {
    const mockEvent = {
      id: 1,
      user_id: 1,
      event_type: WebhookEventType.SESSION_CREATED,
      payload: '{"session_id":"sess-001"}',
      delivered: false,
      attempts: 0,
    };

    mockTable = {
      insert: vi.fn().mockResolvedValue([1]),
      where: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEvent),
      }),
    };

    const event = await WebhookEventModel.create({
      user_id: 1,
      event_type: WebhookEventType.SESSION_CREATED,
      payload: { session_id: 'sess-001' },
    });

    expect(event).toBeTruthy();
    expect(event.id).toBe(1);
    expect(event.payload).toEqual({ session_id: 'sess-001' });
  });

  it('WE-02: 应该通过ID查找事件并解析payload', async () => {
    mockTable = {
      where: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1,
          event_type: WebhookEventType.SESSION_CONNECTED,
          payload: '{"key":"value"}',
        }),
      }),
    };

    const found = await WebhookEventModel.findById(1);
    expect(found).toBeTruthy();
    expect(found!.payload).toEqual({ key: 'value' });
  });

  it('WE-03: 查找不存在的ID应返回null', async () => {
    mockTable = {
      where: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    };

    const found = await WebhookEventModel.findById(999);
    expect(found).toBeNull();
  });

  it('WE-04: 应该标记事件为已发送', async () => {
    const updatedEvent = {
      id: 1,
      delivered: true,
      attempts: 1,
      last_attempt: new Date(),
      payload: '{}',
    };

    mockTable = {
      where: vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue(undefined),
        first: vi.fn().mockResolvedValue(updatedEvent),
      }),
    };

    // For db.raw calls
    const { db } = await import('../../../config/database.js');
    const origDb = db;

    const result = await WebhookEventModel.markDelivered(1);
    expect(result).toBeTruthy();
    expect(result!.delivered).toBe(true);
    expect(result!.attempts).toBe(1);
  });

  it('WE-05: 应该标记事件为发送失败', async () => {
    const updatedEvent = {
      id: 1,
      delivered: false,
      attempts: 1,
      error: 'Connection timeout',
      payload: '{}',
    };

    mockTable = {
      where: vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue(undefined),
        first: vi.fn().mockResolvedValue(updatedEvent),
      }),
    };

    const result = await WebhookEventModel.markFailed(1, 'Connection timeout');
    expect(result).toBeTruthy();
    expect(result!.delivered).toBe(false);
    expect(result!.attempts).toBe(1);
    expect(result!.error).toBe('Connection timeout');
  });

  it('WE-06: findPending应返回未发送且重试<3次的事件', async () => {
    const pendingEvents = [
      { id: 1, delivered: false, attempts: 0, payload: '{"a":1}' },
      { id: 2, delivered: false, attempts: 2, payload: '{"b":2}' },
    ];

    const mockLimit = vi.fn().mockResolvedValue(pendingEvents);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere2 = vi.fn().mockReturnValue({ orderBy: mockOrderBy });

    mockTable = {
      where: vi.fn().mockReturnValue({ where: mockWhere2 }),
    };

    const result = await WebhookEventModel.findPending(10);
    expect(result.length).toBe(2);
    expect(result[0].payload).toEqual({ a: 1 });
    expect(result[1].payload).toEqual({ b: 2 });
  });

  it('WE-07: findByUserId应返回分页结果', async () => {
    const events = [
      { id: 1, payload: '{}' },
      { id: 2, payload: '{}' },
    ];

    const queryHandler = vi
      .fn()
      .mockReturnValueOnce({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(events),
          }),
        }),
      })
      .mockReturnValueOnce({
        count: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 2 }),
        }),
      });

    mockTable = {
      where: queryHandler,
    };

    const result = await WebhookEventModel.findByUserId(1, { page: '1', limit: '10' });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });

  it('WE-08: findAll应返回分页结果', async () => {
    const events = [{ id: 1, payload: '{"x":1}' }];

    mockTable = {
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockResolvedValue(events),
        }),
      }),
      count: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ count: 1 }),
      }),
    };

    const result = await WebhookEventModel.findAll({ page: '1', limit: '10' });
    expect(result.items.length).toBe(1);
    expect(result.total).toBe(1);
  });

  it('WE-09: 应该正确解析复杂JSON payload', async () => {
    mockTable = {
      where: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1,
          payload: '{"nested":{"key":"value"},"array":[1,2,3],"bool":true}',
        }),
      }),
    };

    const found = await WebhookEventModel.findById(1);
    expect(found!.payload).toEqual({
      nested: { key: 'value' },
      array: [1, 2, 3],
      bool: true,
    });
  });

  it('WE-10: markDelivered不存在的事件应返回null', async () => {
    mockTable = {
      where: vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue(undefined),
        first: vi.fn().mockResolvedValue(null),
      }),
    };

    const result = await WebhookEventModel.markDelivered(999);
    expect(result).toBeNull();
  });
});
