import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../models/session/index.js', () => ({
  SessionModel: {
    create: vi.fn(),
  },
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    register: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

describe('admin-test.service', () => {
  let SessionModel: any;
  let MachineModel: any;
  let uuidv4: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const sessionModule = await import('../../../models/session/index.js');
    SessionModel = sessionModule.SessionModel;

    const machineModule = await import('../../../models/machine.model.js');
    MachineModel = machineModule.MachineModel;

    const uuidModule = await import('uuid');
    uuidv4 = uuidModule.v4;
  });

  describe('createTestSessions', () => {
    it('count > 0 时应创建指定数量的会话', async () => {
      const mockSession = { id: 'sess-1', user_id: 1 };
      vi.mocked(SessionModel.create).mockResolvedValue(mockSession);

      const { createTestSessions } = await import('../../../services/admin-test.service.js');
      const result = await createTestSessions(3, 1);

      expect(result).toHaveLength(3);
      expect(SessionModel.create).toHaveBeenCalledTimes(3);
      expect(SessionModel.create).toHaveBeenCalledWith({ user_id: 1 });
    });

    it('count = 0 时应返回空数组', async () => {
      const { createTestSessions } = await import('../../../services/admin-test.service.js');
      const result = await createTestSessions(0, 1);

      expect(result).toEqual([]);
      expect(SessionModel.create).not.toHaveBeenCalled();
    });

    it('create 返回 null 时应跳过该会话', async () => {
      vi.mocked(SessionModel.create)
        .mockResolvedValueOnce({ id: 's1', user_id: 1 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 's3', user_id: 1 });

      const { createTestSessions } = await import('../../../services/admin-test.service.js');
      const result = await createTestSessions(3, 1);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 's1', user_id: 1 });
      expect(result[1]).toEqual({ id: 's3', user_id: 1 });
    });
  });

  describe('createTestMachines', () => {
    it('count > 0 时应创建指定数量的机器', async () => {
      const mockMachine = { id: 'mach-1', hostname: 'test-machine' };
      vi.mocked(uuidv4).mockReturnValue('test-uuid');
      vi.mocked(MachineModel.register).mockResolvedValue(mockMachine);

      const { createTestMachines } = await import('../../../services/admin-test.service.js');
      const result = await createTestMachines(2);

      expect(result).toHaveLength(2);
      expect(MachineModel.register).toHaveBeenCalledTimes(2);
      expect(MachineModel.register).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid',
          grpcPort: expect.any(Number),
          proxyPort: expect.any(Number),
          maxInstances: 10,
        })
      );
    });

    it('count = 0 时应返回空数组', async () => {
      const { createTestMachines } = await import('../../../services/admin-test.service.js');
      const result = await createTestMachines(0);

      expect(result).toEqual([]);
      expect(MachineModel.register).not.toHaveBeenCalled();
    });

    it('register 返回 null 时应跳过该机器', async () => {
      vi.mocked(uuidv4).mockReturnValue('test-uuid');
      vi.mocked(MachineModel.register).mockResolvedValueOnce({ id: 'm1' }).mockResolvedValueOnce(null);

      const { createTestMachines } = await import('../../../services/admin-test.service.js');
      const result = await createTestMachines(2);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: 'm1' });
    });
  });
});
