export async function up(knex) {
  const isMySQL = knex.client.config.client === 'mysql2';

  const indexes = [
    { table: 'sessions', column: 'created_at', name: 'idx_sessions_created_at' },
    { table: 'operation_logs', column: 'target_user_id', name: 'idx_operation_logs_target_user_id' },
    { table: 'operation_logs', column: 'created_at', name: 'idx_operation_logs_created_at' },
    { table: 'credit_history', column: 'created_at', name: 'idx_credit_history_created_at' },
    { table: 'machines', column: 'status', name: 'idx_machines_status' },
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
    { table: 'sessions', name: 'idx_sessions_created_at' },
    { table: 'operation_logs', name: 'idx_operation_logs_target_user_id' },
    { table: 'operation_logs', name: 'idx_operation_logs_created_at' },
    { table: 'credit_history', name: 'idx_credit_history_created_at' },
    { table: 'machines', name: 'idx_machines_status' },
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
