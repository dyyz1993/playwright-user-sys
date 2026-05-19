import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../models/session/index.js', () => ({
  SessionModel: {
    countActiveSessions: vi.fn(),
    countAll: vi.fn(),
    sumUsedCredits: vi.fn(),
    getRecentSessions: vi.fn(),
  },
}));

vi.mock('../../../models/machine.model.js', () => ({
  MachineModel: {
    countAll: vi.fn(),
    countOnline: vi.fn(),
  },
}));

vi.mock('../../../services/user.service.js', () => ({
  countAll: vi.fn(),
  countNewUsers: vi.fn(),
  sumAllCredits: vi.fn(),
  getUserById: vi.fn(),
}));

describe('DashboardController', () => {
  let SessionModel: ReturnType<typeof vi.fn>;
  let MachineModel: ReturnType<typeof vi.fn>;
  let UserService: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const sessionModule = await import('../../../models/session/index.js');
    SessionModel = sessionModule.SessionModel;

    const machineModule = await import('../../../models/machine.model.js');
    MachineModel = machineModule.MachineModel;

    const userModule = await import('../../../services/user.service.js');
    UserService = userModule;
  });

  describe('getEmptyDashboardData', () => {
    it('应该返回所有字段为零值的空仪表盘数据', async () => {
      const { getEmptyDashboardData } = await import('../../../controllers/admin/dashboard.controller.js');

      const result = getEmptyDashboardData();

      expect(result).toEqual({
        stats: {
          activeSessions: 0,
          totalSessions: 0,
          totalMachines: 0,
          onlineMachines: 0,
          totalUsers: 0,
          newUsers: 0,
          totalCredits: 0,
          usedCredits: 0,
          sessionChange: 0,
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0,
        },
        recentSessions: [],
        currentUserApiKey: '',
      });
    });
  });

  describe('getDashboardData', () => {
    const mockDashboardCounts = () => {
      vi.mocked(SessionModel.countActiveSessions).mockResolvedValue(5);
      vi.mocked(SessionModel.countAll).mockResolvedValue(100);
      vi.mocked(MachineModel.countAll).mockResolvedValue(10);
      vi.mocked(MachineModel.countOnline).mockResolvedValue(3);
      vi.mocked(UserService.countAll).mockResolvedValue(50);
      vi.mocked(UserService.countNewUsers).mockResolvedValue(7);
      vi.mocked(UserService.sumAllCredits).mockResolvedValue(5000);
      vi.mocked(SessionModel.sumUsedCredits).mockResolvedValue(2000);
      vi.mocked(SessionModel.getRecentSessions).mockResolvedValue([
        { id: 1, status: 'active' },
        { id: 2, status: 'ended' },
      ]);
    };

    it('不传 userId 时应该返回仪表盘数据且 currentUserApiKey 为空', async () => {
      mockDashboardCounts();

      const { getDashboardData } = await import('../../../controllers/admin/dashboard.controller.js');

      const result = await getDashboardData();

      expect(result.stats).toEqual({
        activeSessions: 5,
        totalSessions: 100,
        totalMachines: 10,
        onlineMachines: 3,
        totalUsers: 50,
        newUsers: 7,
        totalCredits: 5000,
        usedCredits: 2000,
        sessionChange: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
      });
      expect(result.recentSessions).toEqual([
        { id: 1, status: 'active' },
        { id: 2, status: 'ended' },
      ]);
      expect(result.currentUserApiKey).toBe('');
      expect(UserService.getUserById).not.toHaveBeenCalled();
    });

    it('传入 userId 且用户存在时应该返回该用户的 apiKey', async () => {
      mockDashboardCounts();
      vi.mocked(UserService.getUserById).mockResolvedValue({
        id: 1,
        api_key: 'sk-test-key-123',
      });

      const { getDashboardData } = await import('../../../controllers/admin/dashboard.controller.js');

      const result = await getDashboardData(1);

      expect(UserService.getUserById).toHaveBeenCalledWith(1);
      expect(result.currentUserApiKey).toBe('sk-test-key-123');
    });

    it('传入 userId 但用户不存在时 currentUserApiKey 应为空字符串', async () => {
      mockDashboardCounts();
      vi.mocked(UserService.getUserById).mockResolvedValue(null);

      const { getDashboardData } = await import('../../../controllers/admin/dashboard.controller.js');

      const result = await getDashboardData(999);

      expect(UserService.getUserById).toHaveBeenCalledWith(999);
      expect(result.currentUserApiKey).toBe('');
    });

    it('传入 userId 但用户 api_key 为 undefined 时 currentUserApiKey 应为空字符串', async () => {
      mockDashboardCounts();
      vi.mocked(UserService.getUserById).mockResolvedValue({ id: 1 });

      const { getDashboardData } = await import('../../../controllers/admin/dashboard.controller.js');

      const result = await getDashboardData(1);

      expect(result.currentUserApiKey).toBe('');
    });

    it('SessionModel 抛出异常时应该抛出错误', async () => {
      vi.mocked(SessionModel.countActiveSessions).mockRejectedValue(new Error('DB error'));

      const { getDashboardData } = await import('../../../controllers/admin/dashboard.controller.js');

      await expect(getDashboardData()).rejects.toThrow('DB error');
    });

    it('UserService.countAll 抛出异常时应该抛出错误', async () => {
      vi.mocked(SessionModel.countActiveSessions).mockResolvedValue(1);
      vi.mocked(SessionModel.countAll).mockResolvedValue(10);
      vi.mocked(MachineModel.countAll).mockResolvedValue(2);
      vi.mocked(MachineModel.countOnline).mockResolvedValue(1);
      vi.mocked(UserService.countAll).mockRejectedValue(new Error('User service down'));

      const { getDashboardData } = await import('../../../controllers/admin/dashboard.controller.js');

      await expect(getDashboardData()).rejects.toThrow('User service down');
    });

    it('UserService.getUserById 抛出异常时应该抛出错误', async () => {
      mockDashboardCounts();
      vi.mocked(UserService.getUserById).mockRejectedValue(new Error('User fetch failed'));

      const { getDashboardData } = await import('../../../controllers/admin/dashboard.controller.js');

      await expect(getDashboardData(1)).rejects.toThrow('User fetch failed');
    });

    it('应该并发调用所有统计数据查询', async () => {
      mockDashboardCounts();

      const { getDashboardData } = await import('../../../controllers/admin/dashboard.controller.js');

      await getDashboardData();

      expect(SessionModel.countActiveSessions).toHaveBeenCalledOnce();
      expect(SessionModel.countAll).toHaveBeenCalledOnce();
      expect(MachineModel.countAll).toHaveBeenCalledOnce();
      expect(MachineModel.countOnline).toHaveBeenCalledOnce();
      expect(UserService.countAll).toHaveBeenCalledOnce();
      expect(UserService.countNewUsers).toHaveBeenCalledWith(7);
      expect(UserService.sumAllCredits).toHaveBeenCalledOnce();
      expect(SessionModel.sumUsedCredits).toHaveBeenCalledOnce();
      expect(SessionModel.getRecentSessions).toHaveBeenCalledWith(10);
    });
  });
});
