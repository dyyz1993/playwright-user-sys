import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockDb = {
  insert: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  offset: vi.fn(),
  count: vi.fn(),
  sum: vi.fn(),
  first: vi.fn(),
};

const chainable = () => {
  const fn = vi.fn();
  fn.mockReturnValue({
    orderBy: mockDb.orderBy.mockReturnValue({
      limit: mockDb.limit.mockReturnValue({
        offset: mockDb.offset.mockReturnValue([]),
      }),
    }),
    count: mockDb.count.mockReturnValue({ first: mockDb.first }),
    sum: mockDb.sum.mockReturnValue({ first: mockDb.first }),
    first: mockDb.first,
  });
  return fn;
};

mockDb.where.mockReturnValue({
  orderBy: mockDb.orderBy.mockReturnValue({
    limit: mockDb.limit.mockReturnValue({
      offset: mockDb.offset.mockReturnValue([]),
    }),
  }),
  count: mockDb.count.mockReturnValue({ first: mockDb.first }),
  sum: mockDb.sum.mockReturnValue({ first: mockDb.first }),
  first: mockDb.first,
});

mockDb.insert.mockReturnValue([1]);

vi.mock('../../../config/database.js', () => ({
  db: (table: string) => {
    if (table === 'credit_history') return mockDb;
    return mockDb;
  },
}));

describe('CreditHistoryModel', () => {
  let CreditHistoryModel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../models/credit-history.model.js');
    CreditHistoryModel = mod.CreditHistoryModel;
  });

  it('CH-01: 应该成功创建点数历史记录', async () => {
    const record = await CreditHistoryModel.create({
      user_id: 1,
      action: 'use',
      amount: 10,
      balance_after: 90,
      description: '测试扣费',
    });

    expect(record).toBeTruthy();
    expect(record.id).toBe(1);
    expect(record.user_id).toBe(1);
    expect(record.action).toBe('use');
    expect(record.amount).toBe(10);
    expect(record.balance_after).toBe(90);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('CH-02: 应该创建充值记录', async () => {
    const record = await CreditHistoryModel.create({
      user_id: 1,
      action: 'recharge',
      amount: 50,
      balance_after: 150,
      description: '测试充值',
    });

    expect(record.action).toBe('recharge');
    expect(record.amount).toBe(50);
  });

  it('CH-03: 应该调用findByUserId查询', async () => {
    const mockWhere = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockResolvedValue([
            { id: 1, user_id: 1, action: 'use', amount: 10 },
            { id: 2, user_id: 1, action: 'recharge', amount: 50 },
          ]),
        }),
      }),
    });

    const origWhere = mockDb.where;
    mockDb.where = mockWhere;

    const records = await CreditHistoryModel.findByUserId(1);
    expect(records.length).toBe(2);
    expect(mockWhere).toHaveBeenCalledWith('user_id', 1);

    mockDb.where = origWhere;
  });

  it('CH-04: 应该支持分页参数', async () => {
    const mockOffset = vi.fn().mockResolvedValue([]);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });

    const origWhere = mockDb.where;
    mockDb.where = mockWhere;

    await CreditHistoryModel.findByUserId(1, 10, 5);
    expect(mockLimit).toHaveBeenCalledWith(10);
    expect(mockOffset).toHaveBeenCalledWith(5);

    mockDb.where = origWhere;
  });

  it('CH-05: 应该调用findAll查询所有记录', async () => {
    const mockOffset = vi.fn().mockResolvedValue([{ id: 1 }]);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });

    const origOrderBy = mockDb.orderBy;
    mockDb.orderBy = mockOrderBy;

    const records = await CreditHistoryModel.findAll();
    expect(records).toEqual([{ id: 1 }]);
    expect(mockOrderBy).toHaveBeenCalledWith('created_at', 'desc');

    mockDb.orderBy = origOrderBy;
  });

  it('CH-06: 应该返回count结果', async () => {
    mockDb.count.mockReturnValue({
      first: vi.fn().mockResolvedValue({ count: 5 }),
    });
    mockDb.where.mockReturnValue({
      count: mockDb.count,
    });

    const count = await CreditHistoryModel.count();
    expect(count).toBe(5);
  });

  it('CH-07: countByUserId应该按用户筛选', async () => {
    mockDb.where.mockReturnValue({
      count: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ count: 3 }),
      }),
    });

    const count = await CreditHistoryModel.countByUserId(1);
    expect(count).toBe(3);
    expect(mockDb.where).toHaveBeenCalledWith('user_id', 1);
  });

  it('CH-08: count结果为空应返回0', async () => {
    mockDb.where.mockReturnValue({
      count: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    });

    const count = await CreditHistoryModel.countByUserId(999);
    expect(count).toBe(0);
  });

  it('CH-09: getTotalUsedByUser应计算action=use的总额', async () => {
    mockDb.where.mockReturnValueOnce({
      where: vi.fn().mockReturnValue({
        sum: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ total: 30 }),
        }),
      }),
    });

    const total = await CreditHistoryModel.getTotalUsedByUser(1);
    expect(total).toBe(30);
  });

  it('CH-10: getTotalUsedByUser结果为空应返回0', async () => {
    mockDb.where.mockReturnValueOnce({
      where: vi.fn().mockReturnValue({
        sum: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      }),
    });

    const total = await CreditHistoryModel.getTotalUsedByUser(1);
    expect(total).toBe(0);
  });
});
