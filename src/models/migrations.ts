import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { UserRole, UserStatus } from '@shared/types/index.js';
import { hashPassword } from '../utils/auth.js';

// 创建数据库表
export async function createTables() {
  const tableExists = async (tableName: string) => {
    return db.schema.hasTable(tableName);
  };

  // 创建用户表
  if (!(await tableExists('users'))) {
    await db.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('username').notNullable().unique();
      table.string('password').notNullable();
      table.string('email').nullable();
      table.string('role').notNullable().defaultTo(UserRole.USER);
      table.string('status').notNullable().defaultTo(UserStatus.ACTIVE);
      table.integer('credits').notNullable().defaultTo(0);
      table.string('api_key').nullable().unique();
      table.string('webhook_url').nullable();
      table.timestamps(true, true);
    });

    console.log('✅ 用户表创建成功');
  }

  // 创建实例机器表
  if (!(await tableExists('machines'))) {
    await db.schema.createTable('machines', (table) => {
      table.string('id').primary();
      table.string('hostname').notNullable();
      table.string('ip').notNullable();
      table.integer('grpc_port').nullable();
      table.integer('proxy_port').nullable();
      table.float('cpu_usage').defaultTo(0);
      table.float('memory_usage').defaultTo(0);
      table.float('disk_usage').defaultTo(0);
      table.integer('instance_count').defaultTo(0);
      table.integer('max_instances').defaultTo(10);
      table.string('status').defaultTo('online');
      table.timestamp('last_seen').defaultTo(db.fn.now());
      table.timestamps(true, true);
    });

    console.log('✅ 实例机器表创建成功');
  }

  // 创建会话表
  if (!(await tableExists('sessions'))) {
    await db.schema.createTable('sessions', (table) => {
      table.string('id').primary();
      table.integer('user_id').unsigned().notNullable();
      table.string('machine_id').nullable();
      table.integer('port').nullable();
      table.string('status').notNullable();
      table.json('options').nullable();
      table.timestamp('start_time').defaultTo(db.fn.now());
      table.timestamp('end_time').nullable();
      table.timestamp('disconnected_at').nullable();
      table.integer('duration').defaultTo(0);
      table.integer('credits_used').defaultTo(0);
      table.string('screenshot_url').nullable();
      table.timestamp('last_activity').nullable();
      table.string('error_message').nullable();
      table.timestamps(true, true);
    });

    console.log('✅ 会话表创建成功');
  }

  // 创建操作日志表
  if (!(await tableExists('operation_logs'))) {
    await db.schema.createTable('operation_logs', (table) => {
      table.increments('id').primary();
      table.integer('admin_id').unsigned().notNullable();
      table.string('action').notNullable();
      table.json('details').nullable();
      table.integer('target_user_id').unsigned().nullable();
      table.timestamps(true, true);
    });

    console.log('✅ 操作日志表创建成功');
  }

  // 创建请求日志表
  if (!(await tableExists('request_logs'))) {
    await db.schema.createTable('request_logs', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().nullable();
      table.string('method').notNullable();
      table.string('path').notNullable();
      table.integer('status_code').notNullable();
      table.string('ip').nullable();
      table.string('user_agent').nullable();
      table.integer('response_time').nullable();
      table.timestamps(true, true);
    });

    console.log('✅ 请求日志表创建成功');
  }

  // 创建 Webhook 事件表
  if (!(await tableExists('webhook_events'))) {
    await db.schema.createTable('webhook_events', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable();
      table.string('event_type').notNullable();
      table.json('payload').notNullable();
      table.boolean('delivered').defaultTo(false);
      table.integer('attempts').defaultTo(0);
      table.timestamp('last_attempt').nullable();
      table.string('error').nullable();
      table.timestamps(true, true);
    });

    console.log('✅ Webhook 事件表创建成功');
  }

  // 创建积分历史表
  if (!(await tableExists('credit_history'))) {
    await db.schema.createTable('credit_history', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable();
      table.string('action').notNullable(); // 'add', 'deduct', 'use'
      table.integer('amount').notNullable();
      table.integer('balance_after').notNullable();
      table.string('description').nullable();
      table.json('metadata').nullable();
      table.timestamps(true, true);
    });

    console.log('✅ 积分历史表创建成功');
  }
}

// 创建性能优化索引
export async function createIndexes() {
  const indexExists = async (indexName: string) => {
    const result = await db.raw(
      `SELECT COUNT(*) as count FROM information_schema.statistics WHERE index_name = ?`,
      [indexName]
    );
    const count = result[0]?.[0]?.count || result[0]?.count || 0;
    return count > 0;
  };

  const safeCreateIndex = async (indexName: string, table: string, column: string) => {
    try {
      await db.raw(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${column})`);
      console.log(`✅ 索引 ${indexName} 创建成功`);
    } catch (err: any) {
      if (err.code === 'ER_DUP_KEYNAME' || err.message?.includes('already exists')) {
        console.log(`⏭️ 索引 ${indexName} 已存在，跳过`);
      } else {
        throw err;
      }
    }
  };

  // Sessions table indexes
  await safeCreateIndex('idx_sessions_user_id', 'sessions', 'user_id');
  await safeCreateIndex('idx_sessions_machine_id', 'sessions', 'machine_id');
  await safeCreateIndex('idx_sessions_status', 'sessions', 'status');
  await safeCreateIndex('idx_sessions_start_time', 'sessions', 'start_time');

  // Credit history indexes
  await safeCreateIndex('idx_credit_history_user_id', 'credit_history', 'user_id');
  await safeCreateIndex('idx_credit_history_action', 'credit_history', 'action');

  // Operation logs indexes
  await safeCreateIndex('idx_operation_logs_admin_id', 'operation_logs', 'admin_id');

  // Users status index
  await safeCreateIndex('idx_users_status', 'users', 'status');
}

// 初始化管理员账号
export async function initAdminUser() {
  const hashedPassword = await hashPassword(env.ADMIN_PASSWORD);

  const adminUser = await db('users').where({ username: env.ADMIN_USERNAME }).first();

  if (!adminUser) {
    await db('users').insert({
      username: env.ADMIN_USERNAME,
      password: hashedPassword,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      credits: 9999999, // 管理员无限点数
      created_at: new Date(),
      updated_at: new Date(),
    });

    console.log(`✅ 管理员账号 ${env.ADMIN_USERNAME} 创建成功`);
  } else {
    // 强制更新密码和角色，确保可以通过环境变量重置
    await db('users').where({ id: adminUser.id }).update({
      password: hashedPassword,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      updated_at: new Date(),
    });

    console.log(`✅ 管理员账号 ${env.ADMIN_USERNAME} 已更新 (确保密码与环境变量同步)`);
  }
}

// 运行所有迁移
export async function runMigrations() {
  try {
    console.log('🔄 开始数据库迁移...');
    await createTables();
    await createIndexes();
    await initAdminUser();
    console.log('✅ 数据库迁移完成');
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error);
    throw error;
  }
}

export default { runMigrations };
