import { OperationLogModel } from '../models/operation-log.model.js';
import { UserModel } from '../models/user.model.js';
import { logger } from '@shared/utils/logger.js';

export async function getUserOperationLogs(userId: number, options: { page: string; limit: string }) {
  const existingUser = await UserModel.findById(userId);
  if (!existingUser) {
    throw new Error('用户不存在');
  }

  const result = await OperationLogModel.findByTargetUserId(userId, options);
  return result;
}

export async function findUserById(userId: number) {
  return UserModel.findById(userId);
}

export async function listOperationLogs(page: number, limit: number, filters: Record<string, unknown>) {
  return OperationLogModel.paginate(page, limit, filters);
}

export async function getOperationLogStats(filters: Record<string, unknown>) {
  return OperationLogModel.getStats(filters);
}

export async function createOperationLog(data: {
  admin_id: number;
  action: string;
  details?: Record<string, unknown>;
  target_user_id?: number;
}): Promise<void> {
  try {
    await OperationLogModel.create(data);
  } catch (err) {
    logger.warn('记录操作日志失败:', err);
  }
}
