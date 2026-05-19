import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');
const MIGRATION_FILE = '20250105000000_add_missing_indexes.js';

interface ExpectedIndex {
  table: string;
  column: string;
  name: string;
}

const EXPECTED_INDEXES: ExpectedIndex[] = [
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

describe('Performance Indexes Migration', () => {
  it('migration file should exist', () => {
    const filePath = path.join(MIGRATIONS_DIR, MIGRATION_FILE);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('migration should export up and down functions', async () => {
    const filePath = path.join(MIGRATIONS_DIR, MIGRATION_FILE);
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('export async function up');
    expect(content).toContain('export async function down');
  });

  it('up function should create all expected indexes', async () => {
    const filePath = path.join(MIGRATIONS_DIR, MIGRATION_FILE);
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const idx of EXPECTED_INDEXES) {
      expect(content, `Missing index definition for ${idx.name}`).toContain(idx.name);
      expect(content, `Missing column ${idx.column} in index ${idx.name}`).toContain(idx.column);
      expect(content, `Missing table ${idx.table} in index ${idx.name}`).toContain(idx.table);
    }
  });

  it('down function should drop all expected indexes', async () => {
    const filePath = path.join(MIGRATIONS_DIR, MIGRATION_FILE);
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const idx of EXPECTED_INDEXES) {
      expect(content, `Missing drop for index ${idx.name}`).toContain(idx.name);
    }
  });

  it('migration should support both MySQL and SQLite', async () => {
    const filePath = path.join(MIGRATIONS_DIR, MIGRATION_FILE);
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('mysql2');
    expect(content).toContain('CREATE INDEX IF NOT EXISTS');
    expect(content).toContain('ALTER TABLE');
  });
});

describe('Existing indexes coverage audit', () => {
  const existingMigrations = ['20250102000000_add_performance_indexes.js', '20250104000000_add_query_indexes.js'];

  const ALREADY_INDEXED = [
    'idx_sessions_user_id',
    'idx_sessions_machine_id',
    'idx_sessions_status',
    'idx_sessions_start_time',
    'idx_sessions_created_at',
    'idx_credit_history_user_id',
    'idx_credit_history_action',
    'idx_credit_history_created_at',
    'idx_operation_logs_admin_id',
    'idx_operation_logs_target_user_id',
    'idx_operation_logs_created_at',
    'idx_users_status',
    'idx_machines_status',
  ];

  it('existing indexes should not be duplicated in new migration', async () => {
    const filePath = path.join(MIGRATIONS_DIR, MIGRATION_FILE);
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf-8');

    for (const existingIdx of ALREADY_INDEXED) {
      expect(content, `Duplicate index ${existingIdx} found in new migration`).not.toContain(existingIdx);
    }
  });

  it('all high-frequency query columns should be indexed', () => {
    const allMigrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.js'))
      .sort();

    const allContent = allMigrationFiles.map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8')).join('\n');

    const criticalIndexes = [
      'idx_sessions_user_id',
      'idx_sessions_status',
      'idx_credit_history_user_id',
      'idx_credit_history_created_at',
      'idx_operation_logs_admin_id',
      'idx_operation_logs_created_at',
      'idx_users_status',
    ];

    for (const idx of criticalIndexes) {
      expect(allContent, `Critical index ${idx} missing across all migrations`).toContain(idx);
    }
  });
});
