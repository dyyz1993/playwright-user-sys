/**
 * 添加 proxy_port 字段到 machines 表
 */
export async function up(knex) {
  return knex.schema.hasTable('machines').then(exists => {
    if (exists) {
      return knex.schema.alterTable('machines', table => {
        table.integer('proxy_port').nullable();
      });
    }
  });
}

/**
 * 回滚：删除 proxy_port 字段
 */
export async function down(knex) {
  return knex.schema.hasTable('machines').then(exists => {
    if (exists) {
      return knex.schema.alterTable('machines', table => {
        table.dropColumn('proxy_port');
      });
    }
  });
}
