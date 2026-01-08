import { db, initDatabase } from './dist/src/config/database.js';
import { hashPassword } from './dist/src/utils/auth.js';

async function check() {
  try {
    await initDatabase();
    const user = await db('users').where({ username: 'admin' }).first();
    if (!user) {
      console.log('ADMIN_NOT_FOUND');
    } else {
      console.log('ADMIN_FOUND');
      console.log('HASH:' + user.password);
      const expected = await hashPassword('REDACTED_ADMIN_PASS');
      console.log('EXPECTED:' + expected);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

check();
