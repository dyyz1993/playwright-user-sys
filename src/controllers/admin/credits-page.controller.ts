import { CreditHistoryModel } from '../../models/credit-history.model.js';
import * as UserService from '../../services/user.service.js';

export async function getCreditsHistoryPageData(query: { page?: string; limit?: string; dateRange?: string }) {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

  const offset = (page - 1) * limit;
  const history = await CreditHistoryModel.findAll(limit, offset);
  const totalRecords = await CreditHistoryModel.count();

  const users = await UserService.listUsers({ limit: '10000' });
  const userMap = new Map(users.items.map((u) => [u.id, u.username]));

  const historyWithUsername = history.map((record) => ({
    ...record,
    username: userMap.get(record.user_id) || null,
  }));

  return {
    history: historyWithUsername,
    page,
    limit,
    totalRecords,
  };
}
