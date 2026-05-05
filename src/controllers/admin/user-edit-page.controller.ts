import * as UserService from '../../services/user.service.js';
import { SessionModel } from '../../models/session.model.js';

export async function getUserEditPageData(userId: number) {
  const user = await UserService.getUserById(userId);
  if (!user) return null;

  const stats = await SessionModel.getUserSessionStats(userId);

  return {
    userData: {
      id: user.id,
      username: user.username,
      email: user.email || '',
      role: user.role,
      status: user.status,
      credits: user.credits,
      api_key: user.api_key || '',
      webhook_url: user.webhook_url || '',
      created_at: user.created_at,
    },
    stats,
  };
}
