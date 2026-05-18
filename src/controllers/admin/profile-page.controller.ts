import * as UserService from '../../services/user.service.js';
import { CreditHistoryModel } from '../../models/credit-history.model.js';
import { SessionModel } from '../../models/session/index.js';
import { env } from '../../config/env.js';

export async function getProfilePageData(userId: number) {
  const user = await UserService.getUserById(userId);
  if (!user) return null;

  const creditHistory = await CreditHistoryModel.findByUserId(user.id, 5);
  const sessionStats = await SessionModel.getUserSessionStats(user.id);
  const usedCredits = sessionStats.total_credits_used;

  const managerUrl = env.PUBLIC_MANAGER_URL || `${env.HOST}:${env.PORT}`;
  const baseUrl = `http://${managerUrl}`;
  const wsUrl = `ws://${managerUrl}/ws/connect`;

  return {
    userData: {
      email: user.email,
      webhook_url: user.webhook_url,
      credits: user.credits,
      api_key: user.api_key,
      created_at: user.created_at,
      used_credits: usedCredits,
    },
    creditHistory,
    baseUrl,
    wsUrl,
    proxyPort: env.PROXY_PORT,
  };
}
