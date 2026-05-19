import { describe, it, expect, beforeEach, vi } from 'vitest';

let mockTable: Record<string, ReturnType<typeof vi.fn>>;
const mockRaw = vi.fn((sql: string) => sql);

const dbFn = (tableOrMethod: string) => {
  if (tableOrMethod === 'webhook_events') return mockTable;
  return mockTable;
};
dbFn.raw = mockRaw;

vi.mock('../../../config/database.js', () => ({
  db: dbFn,
}));

function createMockChain(finalValue: unknown) {
  const chain: ((...args: unknown[]) => Record<string, unknown>) & Record<string, unknown> = (..._args: unknown[]) =>
    chain as unknown as ((...args: unknown[]) => Record<string, unknown>) & Record<string, unknown>;
  chain.then = (resolve: (value?: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
    Promise.resolve(typeof finalValue === 'function' ? finalValue() : finalValue).then(resolve, reject);
  return chain;
}

describe('WebhookEventModel - JSON parse protection', () => {
  let WebhookEventModel: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../models/webhook-event.model.js');
    WebhookEventModel = mod.WebhookEventModel;
  });

  it('WE-SAFE-01: findById should not crash on broken JSON payload', async () => {
    mockTable = {
      where: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1,
          event_type: 'session_created',
          payload: '{not-valid-json!!!',
          delivered: false,
          attempts: 0,
        }),
      }),
    };

    const found = await WebhookEventModel.findById(1);
    expect(found).toBeTruthy();
    expect(found!.payload).toEqual({ raw: '{not-valid-json!!!' });
  });

  it('WE-SAFE-02: findById should handle empty string payload', async () => {
    mockTable = {
      where: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 2,
          event_type: 'session_connected',
          payload: '',
          delivered: false,
          attempts: 0,
        }),
      }),
    };

    const found = await WebhookEventModel.findById(2);
    expect(found).toBeTruthy();
    expect(found!.payload).toEqual({ raw: '' });
  });

  it('WE-SAFE-03: findPending should not crash on broken JSON in array', async () => {
    const pendingEvents = [
      { id: 1, delivered: false, attempts: 0, payload: '{"ok":1}' },
      { id: 2, delivered: false, attempts: 1, payload: 'BROKEN{json' },
    ];

    const mockLimit = vi.fn().mockResolvedValue(pendingEvents);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere2 = vi.fn().mockReturnValue({ orderBy: mockOrderBy });

    mockTable = {
      where: vi.fn().mockReturnValue({ where: mockWhere2 }),
    };

    const result = await WebhookEventModel.findPending(10);
    expect(result.length).toBe(2);
    expect(result[0].payload).toEqual({ ok: 1 });
    expect(result[1].payload).toEqual({ raw: 'BROKEN{json' });
  });

  it('WE-SAFE-04: findByUserId should handle mixed valid/invalid JSON', async () => {
    const events = [
      { id: 1, payload: '{"valid":true}' },
      { id: 2, payload: undefined },
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
    expect(result.items[0].payload).toEqual({ valid: true });
  });

  it('WE-SAFE-05: findAll should not crash on broken JSON', async () => {
    const events = [{ id: 1, payload: 'not-json-at-all' }];

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
    expect(result.items[0].payload).toEqual({ raw: 'not-json-at-all' });
  });
});
