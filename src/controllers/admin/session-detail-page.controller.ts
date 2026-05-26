import { SessionModel } from '../../models/session/index.js';
import { env } from '../../config/env.js';

export async function getSessionDetailPageData(sessionId: string) {
  const session = await SessionModel.getDetailById(sessionId);
  if (!session) return null;

  let wsUrl = '';
  if (env.PUBLIC_MANAGER_URL) {
    wsUrl = `ws://${env.PUBLIC_MANAGER_URL}/ws/connect?sessionId=${session.id}`;
  }

  return { session, wsUrl };
}
