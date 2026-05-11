import { OperationLogModel } from '../../models/operation-log.model.js';
import * as UserService from '../../services/user.service.js';

export async function getLogsPageData(query: { page?: string; limit?: string; action?: string; dateRange?: string }) {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

  const filters: Record<string, unknown> = {};

  if (query.action) {
    filters.action = query.action;
  }

  if (query.dateRange && query.dateRange !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (query.dateRange === 'today') {
      filters.startDate = today;
    } else if (query.dateRange === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      filters.startDate = yesterday;
      filters.endDate = yesterday;
    } else if (query.dateRange === 'week') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      filters.startDate = startOfWeek;
    } else if (query.dateRange === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      filters.startDate = startOfMonth;
    }
  }

  const { items, total } = await OperationLogModel.paginate(page, limit, filters);

  const logsWithUserInfo = await Promise.all(
    items.map(async (log) => {
      let username = '系统';
      let role = '普通用户';
      if (log.admin_id) {
        const adminUser = await UserService.getUserById(log.admin_id);
        if (adminUser) {
          username = adminUser.username;
          role = adminUser.role === 'admin' ? '管理员' : '普通用户';
        }
      }
      return {
        ...log,
        username,
        role,
      };
    })
  );

  return {
    logs: logsWithUserInfo,
    page,
    limit,
    totalLogs: total,
    filters: {
      action: query.action || '',
      dateRange: query.dateRange || 'all',
    },
  };
}
