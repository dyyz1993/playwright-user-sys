import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

config({ path: path.join(rootDir, '.env.dev') });

process.env.NODE_ENV = 'test';
if (!process.env.DB_TYPE) {
  process.env.DB_TYPE = 'mysql';
}
process.env.DB_NAME = 'playwright_test_user_sys';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars';
process.env.JWT_EXPIRES_IN = '24h';
process.env.ADMIN_PASSWORD = 'test-admin-password-for-testing';
