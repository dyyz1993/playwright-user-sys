/**
 * 添加性能优化索引
 * 为高频查询字段创建索引
 */
export async function up(knex) {
  // Sessions table indexes
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_sessions_machine_id ON sessions(machine_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time)');

  // Credit history indexes
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_credit_history_user_id ON credit_history(user_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_credit_history_action ON credit_history(action)');

  // Operation logs indexes
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_operation_logs_admin_id ON operation_logs(admin_id)');

  // Users status index
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');
}

/**
 * 回滚：删除所有索引
 */
export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_sessions_user_id ON sessions');
  await knex.raw('DROP INDEX IF EXISTS idx_sessions_machine_id ON sessions');
  await knex.raw('DROP INDEX IF EXISTS idx_sessions_status ON sessions');
  await knex.raw('DROP INDEX IF EXISTS idx_sessions_start_time ON sessions');
  await knex.raw('DROP INDEX IF EXISTS idx_credit_history_user_id ON credit_history');
  await knex.raw('DROP INDEX IF EXISTS idx_credit_history_action ON credit_history');
  await knex.raw('DROP INDEX IF EXISTS idx_operation_logs_admin_id ON operation_logs');
  await knex.raw('DROP INDEX IF EXISTS idx_users_status ON users');
}
