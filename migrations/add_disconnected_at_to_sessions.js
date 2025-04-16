/**
 * 添加 disconnected_at 字段到 sessions 表
 */
export async function up(knex) {
  return knex.schema.hasTable('sessions').then(exists => {
    if (exists) {
      return knex.schema.alterTable('sessions', table => {
        table.timestamp('disconnected_at').nullable();
      });
    }
  });
}

/**
 * 回滚：删除 disconnected_at 字段
 */
export async function down(knex) {
  return knex.schema.hasTable('sessions').then(exists => {
    if (exists) {
      return knex.schema.alterTable('sessions', table => {
        table.dropColumn('disconnected_at');
      });
    }
  });
}
