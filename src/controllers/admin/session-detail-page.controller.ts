import { SessionModel } from '../../models/session/index.js';

export async function getSessionDetailPageData(sessionId: string) {
  const session = await SessionModel.getDetailById(sessionId);
  if (!session) return null;
  return { session };
}
