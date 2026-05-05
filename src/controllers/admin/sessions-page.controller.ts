import { SessionModel } from '../../models/session.model.js';
import * as UserService from '../../services/user.service.js';

export async function getSessionsPageData(query: {
  page?: string;
  limit?: string;
  status?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  dateRange?: string;
  sort?: string;
  order?: string;
}) {
  const page = parseInt(query.page || '1');
  const limit = parseInt(query.limit || '10');
  const sort = query.sort || 'created_at';
  const order = (query.order?.toLowerCase() === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const usersResult = await UserService.listUsers({ limit: '10000' });
  const users = usersResult.items;

  const filters: { status?: string; userId?: number; startDate?: Date; endDate?: Date } = {};

  if (query.status) {
    filters.status = query.status;
  }

  if (query.userId) {
    filters.userId = parseInt(query.userId);
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

  if (query.startDate) {
    filters.startDate = new Date(query.startDate);
  }
  if (query.endDate) {
    filters.endDate = new Date(query.endDate);
  }

  const { items, total, totalPages } = await SessionModel.paginateSorted(page, limit, {
    sort,
    order,
    filters,
  });

  return {
    sessions: items,
    users,
    page,
    limit,
    totalSessions: total,
    totalPages,
    pagination: { page, limit, total, totalPages },
    filters: {
      status: query.status || '',
      userId: query.userId || '',
      dateRange: query.dateRange || 'all',
      startDate: query.startDate || '',
      endDate: query.endDate || '',
      sort,
      order,
    },
  };
}
