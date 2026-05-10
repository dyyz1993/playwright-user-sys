import { crudMethods } from './session-crud.model.js';
import { statusMethods } from './session-status.model.js';
import { queryMethods } from './session-queries.model.js';
import { statsMethods } from './session-stats.model.js';
import { paginateMethods } from './session-paginate.model.js';

export type { Session, CreateSessionInput, UpdateSessionInput, SessionFilterOptions, Knex } from './types.js';
export { parseSessionOptions, parseSessionRowWithDates } from './types.js';

class SessionModel {
  static create = crudMethods.create;
  static findById = crudMethods.findById;
  static update = crudMethods.update;
  static batchUpdate = crudMethods.batchUpdate;
  static updateLastActivity = crudMethods.updateLastActivity;
  static getDetailById = crudMethods.getDetailById;

  static markMachineSessionsAsDisconnected = statusMethods.markMachineSessionsAsDisconnected;
  static markConnected = statusMethods.markConnected;
  static markDisconnected = statusMethods.markDisconnected;
  static markExpired = statusMethods.markExpired;
  static markError = statusMethods.markError;
  static checkExpiredSessions = statusMethods.checkExpiredSessions;

  static findByUserId = queryMethods.findByUserId;
  static findActiveSessions = queryMethods.findActiveSessions;
  static getAllByUserId = queryMethods.getAllByUserId;
  static findByMachineId = queryMethods.findByMachineId;
  static findAll = queryMethods.findAll;
  static findActiveSessionsByMachineId = queryMethods.findActiveSessionsByMachineId;
  static getRecentSessions = queryMethods.getRecentSessions;

  static getUserSessionStats = statsMethods.getUserSessionStats;
  static countActiveByUserId = statsMethods.countActiveByUserId;
  static countActiveSessions = statsMethods.countActiveSessions;
  static countAll = statsMethods.countAll;
  static sumUsedCredits = statsMethods.sumUsedCredits;
  static getStats = statsMethods.getStats;

  static paginate = paginateMethods.paginate;
  static paginateSorted = paginateMethods.paginateSorted;
}

export { SessionModel };
export default SessionModel;
