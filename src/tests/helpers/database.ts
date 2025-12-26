/**
 * 测试数据库辅助函数
 * 使用 MySQL 测试数据库进行测试
 *
 * 注意: better-sqlite3 需要编译原生模块，在某些环境下可能无法工作
 * 因此使用 MySQL 进行测试
 */

import { db } from '../../config/database.js';

/**
 * 清空所有表的数据
 * 用于在测试之间清理数据
 */
export async function clearAllTables() {
  await db('users').delete();
  await db('sessions').delete();
  await db('machines').delete();
  await db('credit_history').delete();
  await db('operation_logs').delete();
  await db('request_logs').delete();
  await db('webhook_events').delete();
}

/**
 * 开始一个测试事务
 * 用于在测试中自动回滚更改
 */
export async function startTestTransaction() {
  return db.transaction();
}
