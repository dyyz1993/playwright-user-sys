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
      table.integer('duration').defaultTo(0);
      table.string('screenshot_url').nullable();
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
}

// 初始化管理员账号
export async function initAdminUser() {
  const adminExists = await db('users')
    .where({ role: UserRole.ADMIN })
    .first();

  if (!adminExists) {
    const hashedPassword = await hashPassword(env.ADMIN_PASSWORD);

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
  }
}

// 运行所有迁移
export async function runMigrations() {
  try {
    console.log('🔄 开始数据库迁移...');
    await createTables();
    await initAdminUser();
    console.log('✅ 数据库迁移完成');
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error);
    throw error;
  }
}

export default { runMigrations };
