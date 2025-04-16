import knex, { Knex } from 'knex';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { seedDatabase } from './seed.js';
import fs from 'fs';
import path from 'path';

// 确保SQLite数据库目录存在
if (config.database.client === 'sqlite3') {
  const dbDir = path.dirname(config.database.connection.filename!);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.info(`创建数据库目录: ${dbDir}`);
  }
}

// 创建数据库连接
export const db: Knex = knex(config.database);

/**
 * 初始化数据库 - 运行迁移和种子
 */
export async function initDatabase(): Promise<void> {
  try {
    logger.info('🔄 开始数据库迁移...');

    // 检查用户表是否存在
    const userTableExists = await db.schema.hasTable('users');

    if (!userTableExists) {
      // 创建用户表
      await db.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.string('username').notNullable().unique();
        table.string('password').notNullable();
        table.string('email');
        table.string('role').defaultTo('user');
        table.string('status').defaultTo('active');
        table.string('api_key').notNullable().unique();
        table.integer('credits').defaultTo(0);
        table.integer('used_credits').defaultTo(0);
        table.string('webhook_url');
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
      });

      logger.info('创建用户表完成');
    }

    // 检查会话表是否存在
    const sessionTableExists = await db.schema.hasTable('sessions');

    if (!sessionTableExists) {
      // 创建会话表
      await db.schema.createTable('sessions', (table) => {
        table.string('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.string('machine_id');
        table.string('status').defaultTo('created');
        table.json('config');
        table.string('screenshot_url');
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('ended_at');

        table.foreign('user_id').references('id').inTable('users');
      });

      logger.info('创建会话表完成');
    }

    // 检查机器表是否存在
    const machineTableExists = await db.schema.hasTable('machines');

    if (!machineTableExists) {
      // 创建机器表
      await db.schema.createTable('machines', (table) => {
        table.string('id').primary();
        table.string('name').notNullable();
        table.string('ip_address');
        table.string('status').defaultTo('offline');
        table.integer('max_sessions').defaultTo(5);
        table.json('system_info');
        table.timestamp('last_heartbeat');
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
      });

      logger.info('创建机器表完成');
    }

    // 检查操作日志表是否存在
    const operationLogsTableExists = await db.schema.hasTable('operation_logs');

    if (!operationLogsTableExists) {
      // 创建操作日志表
      await db.schema.createTable('operation_logs', (table) => {
        table.increments('id').primary();
        table.integer('admin_id').unsigned().notNullable();
        table.string('action').notNullable();
        table.json('details');
        table.timestamp('created_at').defaultTo(db.fn.now());

        table.foreign('admin_id').references('id').inTable('users');
      });

      logger.info('创建操作日志表完成');
    }

    // 检查点数历史表是否存在
    const creditHistoryTableExists = await db.schema.hasTable('credit_history');

    if (!creditHistoryTableExists) {
      // 创建点数历史表
      await db.schema.createTable('credit_history', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.integer('amount').notNullable();
        table.string('action').notNullable(); // 'add' 或 'use'
        table.string('reason');
        table.timestamp('created_at').defaultTo(db.fn.now());

        table.foreign('user_id').references('id').inTable('users');
      });

      logger.info('创建点数历史表完成');
    }

    // 检查系统设置表是否存在
    const settingsTableExists = await db.schema.hasTable('settings');

    if (!settingsTableExists) {
      // 创建系统设置表
      await db.schema.createTable('settings', (table) => {
        table.string('key').primary();
        table.text('value');
        table.timestamp('updated_at').defaultTo(db.fn.now());
      });

      logger.info('创建系统设置表完成');
    }

    logger.info('✅ 数据库迁移完成');

    // 运行数据库种子
    await seedDatabase();

  } catch (error: any) {
    logger.error('❌ 数据库迁移失败:', error);
    throw error;
  }
}
