/**
 * 添加缺失的查询性能索引
 * 仅索引实际存在于 schema 中的列
 * 支持 MySQL 和 SQLite
 */
export async function up(knex) {
  const isMySQL = knex.client.config.client === 'mysql2';

  const indexes = [
    { table: 'request_logs', column: 'status_code', name: 'idx_request_logs_status_code' },
    { table: 'request_logs', column: 'created_at', name: 'idx_request_logs_created_at' },
    { table: 'request_logs', column: 'session_id', name: 'idx_request_logs_session_id' },
    { table: 'credit_history', column: 'session_id', name: 'idx_credit_history_session_id' },
    { table: 'operation_logs', column: 'action', name: 'idx_operation_logs_action' },
    { table: 'sessions', column: 'last_activity', name: 'idx_sessions_last_activity' },
    { table: 'machines', column: 'last_seen', name: 'idx_machines_last_seen' },
    { table: 'webhook_events', column: 'event_type', name: 'idx_webhook_events_event_type' },
    { table: 'webhook_events', column: 'session_id', name: 'idx_webhook_events_session_id' },
    { table: 'webhook_events', column: 'status', name: 'idx_webhook_events_status' },
  ];

  for (const idx of indexes) {
    try {
      if (isMySQL) {
        await knex.raw(`ALTER TABLE \`${idx.table}\` ADD INDEX \`${idx.name}\` (\`${idx.column}\`)`);
      } else {
        await knex.raw(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" ("${idx.column}")`);
      }
    } catch (err) {
      if (isMySQL && err.errno === 1061) {
        // already exists
      } else if (!isMySQL && err.message && err.message.includes('already exists')) {
        // already exists
      } else {
        throw err;
      }
    }
  }
};

export async function down(knex) {
  const isMySQL = knex.client.config.client === 'mysql2';

  const indexes = [
    { table: 'request_logs', name: 'idx_request_logs_status_code' },
    { table: 'request_logs', name: 'idx_request_logs_created_at' },
    { table: 'request_logs', name: 'idx_request_logs_session_id' },
    { table: 'credit_history', name: 'idx_credit_history_session_id' },
    { table: 'operation_logs', name: 'idx_operation_logs_action' },
    { table: 'sessions', name: 'idx_sessions_last_activity' },
    { table: 'machines', name: 'idx_machines_last_seen' },
    { table: 'webhook_events', name: 'idx_webhook_events_event_type' },
    { table: 'webhook_events', name: 'idx_webhook_events_session_id' },
    { table: 'webhook_events', name: 'idx_webhook_events_status' },
  ];

  for (const idx of indexes) {
    try {
      if (isMySQL) {
        await knex.raw(`ALTER TABLE \`${idx.table}\` DROP INDEX \`${idx.name}\``);
      } else {
        await knex.raw(`DROP INDEX IF EXISTS "${idx.name}"`);
      }
    } catch (err) {
      // ignore
    }
  }
};
