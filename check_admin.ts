import { db } from './src/config/database.js';
import { hashPassword } from './src/utils/auth.js';

async function checkAdmin() {
  try {
    const user = await db('users').where({ username: 'admin' }).first();
    if (!user) {
      console.log('Admin user not found in database!');
      const hashedPassword = await hashPassword('REDACTED_ADMIN_PASS');
      console.log('Creating admin user with password REDACTED_ADMIN_PASS...');
      await db('users').insert({
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        credits: 1000,
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log('Admin user created.');
    } else {
      console.log('Admin user found:', user.username);
      console.log('Hashed password in DB:', user.password);
      const expectedHash = await hashPassword('REDACTED_ADMIN_PASS');
      console.log('Expected hash for "REDACTED_ADMIN_PASS":', expectedHash);
      if (user.password === expectedHash) {
        console.log('Password matches!');
      } else {
        console.log('Password DOES NOT match!');
      }
    }
  } catch (error) {
    console.error('Error checking admin:', error);
  } finally {
    process.exit();
  }
}

checkAdmin();
