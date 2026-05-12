export async function up(knex) {
  const isMySQL = knex.client.config.client === 'mysql2';

  const fkIndexes = [
    { table: 'operation_logs', column: 'target_user_id', name: 'idx_operation_logs_target_user_id' },
  ];

  for (const idx of fkIndexes) {
    try {
      if (isMySQL) {
        await knex.raw(`ALTER TABLE \`${idx.table}\` ADD INDEX \`${idx.name}\` (\`${idx.column}\`)`);
      } else {
        await knex.raw(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" ("${idx.column}")`);
      }
    } catch (err) {
      if (isMySQL && err.errno === 1061) {
        // index already exists
      } else if (!isMySQL && err.message && err.message.includes('already exists')) {
        // index already exists
      } else {
        throw err;
      }
    }
  }

  const foreignKeys = [
    { table: 'sessions', column: 'user_id', refTable: 'users', refColumn: 'id', name: 'fk_sessions_user_id', onDelete: 'CASCADE' },
    { table: 'sessions', column: 'machine_id', refTable: 'machines', refColumn: 'id', name: 'fk_sessions_machine_id', onDelete: 'SET NULL' },
    { table: 'credit_history', column: 'user_id', refTable: 'users', refColumn: 'id', name: 'fk_credit_history_user_id', onDelete: 'CASCADE' },
    { table: 'operation_logs', column: 'admin_id', refTable: 'users', refColumn: 'id', name: 'fk_operation_logs_admin_id', onDelete: 'RESTRICT' },
    { table: 'operation_logs', column: 'target_user_id', refTable: 'users', refColumn: 'id', name: 'fk_operation_logs_target_user_id', onDelete: 'SET NULL' },
  ];

  for (const fk of foreignKeys) {
    try {
      if (isMySQL) {
        await knex.raw(
          `ALTER TABLE \`${fk.table}\` ADD CONSTRAINT \`${fk.name}\` FOREIGN KEY (\`${fk.column}\`) REFERENCES \`${fk.refTable}\`(\`${fk.refColumn}\`) ON DELETE ${fk.onDelete}`
        );
      } else {
        await knex.raw(
          `ALTER TABLE "${fk.table}" ADD CONSTRAINT "${fk.name}" FOREIGN KEY ("${fk.column}") REFERENCES "${fk.refTable}"("${fk.refColumn}") ON DELETE ${fk.onDelete}`
        );
      }
    } catch (err) {
      if (
        (isMySQL && (err.errno === 1826 || err.errno === 1828)) ||
        (!isMySQL && err.message && err.message.includes('already exists'))
      ) {
        // FK already exists, skip
      } else {
        throw err;
      }
    }
  }
};

export async function down(knex) {
  const isMySQL = knex.client.config.client === 'mysql2';

  const foreignKeys = [
    { table: 'sessions', name: 'fk_sessions_user_id' },
    { table: 'sessions', name: 'fk_sessions_machine_id' },
    { table: 'credit_history', name: 'fk_credit_history_user_id' },
    { table: 'operation_logs', name: 'fk_operation_logs_admin_id' },
    { table: 'operation_logs', name: 'fk_operation_logs_target_user_id' },
  ];

  for (const fk of foreignKeys) {
    try {
      if (isMySQL) {
        await knex.raw(`ALTER TABLE \`${fk.table}\` DROP FOREIGN KEY \`${fk.name}\``);
      } else {
        await knex.schema.alterTable(fk.table, (table) => {
          table.dropForeign(fk.name.replace('fk_', '').split('_').slice(0, -1).join('_'), fk.name);
        });
      }
    } catch (err) {
      // ignore if not exists
    }
  }

  const dropIndexes = [
    { table: 'operation_logs', name: 'idx_operation_logs_target_user_id' },
  ];

  for (const idx of dropIndexes) {
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
