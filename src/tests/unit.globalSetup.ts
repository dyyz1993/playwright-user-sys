import knex from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const dbPath = path.join(tmpdir(), `unit-test-${randomUUID()}.sqlite`);
process.env.UNIT_TEST_SQLITE_PATH = dbPath;

export default async function setup() {
  console.log('[Unit GlobalSetup] Initializing SQLite for unit tests:', dbPath);

  process.env.NODE_ENV = 'test';
  process.env.DB_TYPE = 'sqlite';
  process.env.DB_PATH = dbPath;
  process.env.DB_NAME = 'playwright_test_user_sys';

  const migrationsDir = path.join(rootDir, 'migrations');
  if (!existsSync(migrationsDir)) {
    console.log('[Unit GlobalSetup] No migrations dir, skipping');
    return;
  }

  const db = knex({
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
    migrations: { directory: migrationsDir },
  });

  try {
    await db.migrate.latest();
    console.log('[Unit GlobalSetup] Migrations completed');
  } finally {
    await db.destroy();
  }
}
