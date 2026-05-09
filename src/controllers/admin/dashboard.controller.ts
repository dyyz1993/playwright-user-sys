import { SessionModel } from '../../models/session.model.js';
import { MachineModel } from '../../models/machine.model.js';
import { UserModel } from '../../models/user.model.js';
import * as UserService from '../../services/user.service.js';

export async function getDashboardData(userId?: number) {
  const [
    activeSessions,
    totalMachines,
    onlineMachines,
    totalUsers,
    newUsers,
    totalCredits,
    usedCredits,
    recentSessions,
  ] = await Promise.all([
    SessionModel.countActiveSessions(),
    MachineModel.countAll(),
    MachineModel.countOnline(),
    UserService.countAll(),
    UserService.countNewUsers(7),
    UserService.sumAllCredits(),
    SessionModel.sumUsedCredits(),
    SessionModel.getRecentSessions(10),
  ]);

  let currentUserApiKey = '';
  if (userId) {
    const fullUser = await UserService.getUserById(userId);
    currentUserApiKey = fullUser?.api_key || '';
  }

  return {
    stats: {
      activeSessions,
      totalMachines,
      onlineMachines,
      totalUsers,
      newUsers,
      totalCredits,
      usedCredits,
      sessionChange: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
    },
    recentSessions,
    currentUserApiKey,
  };
}

export function getEmptyDashboardData() {
  return {
    stats: {
      activeSessions: 0,
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
  };
}
