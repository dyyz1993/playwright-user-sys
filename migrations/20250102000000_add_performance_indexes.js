/**
 * 添加性能优化索引
 * 为高频查询字段创建索引
 * 支持 MySQL 和 SQLite
 */
export async function up(knex) {
  const isMySQL = knex.client.config.client === 'mysql2';
  const isSQLite = knex.client.config.client === 'sqlite3' || knex.client.config.client === 'better-sqlite3';

  const indexes = [
    { table: 'sessions', column: 'user_id', name: 'idx_sessions_user_id' },
    { table: 'sessions', column: 'machine_id', name: 'idx_sessions_machine_id' },
    { table: 'sessions', column: 'status', name: 'idx_sessions_status' },
    { table: 'sessions', column: 'start_time', name: 'idx_sessions_start_time' },
    { table: 'credit_history', column: 'user_id', name: 'idx_credit_history_user_id' },
    { table: 'credit_history', column: 'action', name: 'idx_credit_history_action' },
    { table: 'operation_logs', column: 'admin_id', name: 'idx_operation_logs_admin_id' },
    { table: 'users', column: 'status', name: 'idx_users_status' },
  ];

  for (const idx of indexes) {
    try {
      if (isMySQL) {
        await knex.raw(`ALTER TABLE \`${idx.table}\` ADD INDEX \`${idx.name}\` (\`${idx.column}\`)`);
      } else {
        await knex.raw(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" ("${idx.column}")`);
      }
      console.log(`[迁移] 创建索引 ${idx.name} 成功`);
    } catch (err) {
      if (isMySQL && err.errno === 1061) {
        console.log(`[迁移] 索引 ${idx.name} 已存在，跳过`);
      } else if (!isMySQL && err.message && err.message.includes('already exists')) {
        console.log(`[迁移] 索引 ${idx.name} 已存在，跳过`);
      } else {
        throw err;
      }
    }
  }
};

export async function down(knex) {
  const isMySQL = knex.client.config.client === 'mysql2';

  const indexes = [
    { table: 'sessions', name: 'idx_sessions_user_id' },
    { table: 'sessions', name: 'idx_sessions_machine_id' },
    { table: 'sessions', name: 'idx_sessions_status' },
    { table: 'sessions', name: 'idx_sessions_start_time' },
    { table: 'credit_history', name: 'idx_credit_history_user_id' },
    { table: 'credit_history', name: 'idx_credit_history_action' },
    { table: 'operation_logs', name: 'idx_operation_logs_admin_id' },
    { table: 'users', name: 'idx_users_status' },
  ];

  for (const idx of indexes) {
    try {
      if (isMySQL) {
        await knex.raw(`ALTER TABLE \`${idx.table}\` DROP INDEX \`${idx.name}\``);
      } else {
        await knex.raw(`DROP INDEX IF EXISTS "${idx.name}"`);
      }
      console.log(`[迁移] 删除索引 ${idx.name} 成功`);
    } catch (err) {
      if (isMySQL && err.errno === 1091) {
        console.log(`[迁移] 索引 ${idx.name} 不存在，跳过`);
      } else if (!isMySQL) {
        console.log(`[迁移] 索引 ${idx.name} 不存在，跳过`);
      } else {
        throw err;
      }
    }
  }
};
