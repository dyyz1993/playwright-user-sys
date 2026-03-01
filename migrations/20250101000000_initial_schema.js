/**
 * 初始化数据库表结构
 * 创建所有基础表
 */
export async function up(knex) {
  // 创建用户表
  await knex.schema.createTable('users', table => {
    table.increments('id').primary();
    table.string('username', 255).notNullable().unique();
    table.string('password', 255).notNullable();
    table.string('email', 255).unique();
    table.enum('role', ['user', 'admin']).defaultTo('user');
    table.enum('status', ['active', 'inactive', 'suspended']).defaultTo('active');
    table.integer('credits').defaultTo(0);
    table.string('api_key', 255).unique();
    table.string('webhook_url', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 创建机器表
  await knex.schema.createTable('machines', table => {
    table.string('id', 50).primary();
    table.string('hostname', 100);
    table.string('ip', 45);
    table.integer('grpc_port').defaultTo(50051);
    table.integer('proxy_port').defaultTo(8082);
    table.enum('status', ['online', 'offline', 'busy']).defaultTo('offline');
    table.decimal('cpu_usage', 5, 2).defaultTo(0);
    table.decimal('memory_usage', 5, 2).defaultTo(0);
    table.decimal('disk_usage', 5, 2).defaultTo(0);
    table.integer('instance_count').defaultTo(0);
    table.integer('max_instances').defaultTo(10);
    table.timestamp('last_seen');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 创建会话表
  await knex.schema.createTable('sessions', table => {
    table.string('id', 36).primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('machine_id', 50).references('id').inTable('machines').onDelete('SET NULL');
    table.integer('port');
    table.enum('status', ['created', 'connected', 'disconnected', 'expired', 'error']).defaultTo('created');
    table.text('options');
    table.string('viewer_url');
    table.string('ws_endpoint');
    table.string('screenshot_url');
    table.integer('duration').defaultTo(0);
    table.integer('credits_used').defaultTo(0);
    table.timestamp('start_time');
    table.timestamp('end_time');
    table.timestamp('last_activity');
    table.timestamp('disconnected_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 创建积分历史表
  await knex.schema.createTable('credit_history', table => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.enum('type', ['add', 'deduct', 'refund']).notNullable();
    table.integer('amount').notNullable();
    table.integer('balance_after').notNullable();
    table.string('session_id', 36);
    table.string('description', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 创建操作日志表
  await knex.schema.createTable('operation_logs', table => {
    table.increments('id').primary();
    table.integer('admin_id').unsigned().notNullable();
    table.string('action', 50).notNullable();
    table.text('details');
    table.integer('target_user_id').unsigned();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 创建请求日志表
  await knex.schema.createTable('request_logs', table => {
    table.increments('id').primary();
    table.string('session_id', 36);
    table.string('method', 10);
    table.string('url', 500);
    table.integer('status_code');
    table.integer('response_time');
    table.text('headers');
    table.text('body');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 创建 Webhook 事件表
  await knex.schema.createTable('webhook_events', table => {
    table.increments('id').primary();
    table.string('event_type', 50).notNullable();
    table.string('session_id', 36);
    table.text('payload');
    table.enum('status', ['pending', 'sent', 'failed']).defaultTo('pending');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('sent_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

/**
 * 回滚：删除所有表
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('webhook_events');
  await knex.schema.dropTableIfExists('request_logs');
  await knex.schema.dropTableIfExists('operation_logs');
  await knex.schema.dropTableIfExists('credit_history');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('machines');
  await knex.schema.dropTableIfExists('users');
}
