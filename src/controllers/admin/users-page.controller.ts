import * as UserService from '../../services/user.service.js';
import { UserRole, UserStatus } from '@shared/types/index.js';

export async function getUsersPageData(query: {
  page?: string;
  limit?: string;
  role?: string;
  status?: string;
  sort?: string;
  order?: string;
  search?: string;
}) {
  const page = parseInt(query.page || '1');
  const limit = parseInt(query.limit || '10');
  const sort = query.sort || 'created_at';
  const order = query.order || 'desc';

  const { items, total, totalPages } = await UserService.listUsers({
    page: query.page || '1',
    limit: query.limit || '10',
    sort,
    order,
    ...(query.search && { search: query.search }),
    ...(query.role && { role: query.role as UserRole }),
    ...(query.status && { status: query.status as UserStatus }),
  });

  return {
    users: items,
    pagination: { page, limit, total, totalPages },
    page,
    limit,
    totalUsers: total,
    filters: {
      role: query.role || '',
      status: query.status || '',
    },
    query,
  };
}
