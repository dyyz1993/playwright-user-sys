import knex from 'knex';

const TEST_DB_NAME = 'playwright_test_user_sys';
const MAIN_DB_NAME = process.env.DB_NAME || 'playwright_user_sys';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

async function ensureTestDatabase() {
  const adminDb = knex({
    client: 'mysql2',
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    },
  });

  try {
    const [databases] = await adminDb.raw('SHOW DATABASES LIKE ?', [TEST_DB_NAME]);
    
    if (databases.length === 0) {
      console.log(`创建测试数据库: ${TEST_DB_NAME}`);
      await adminDb.raw(`CREATE DATABASE \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log('测试数据库创建成功');
    } else {
      console.log(`测试数据库已存在: ${TEST_DB_NAME}`);
    }
  } catch (error) {
    console.error('检查/创建测试数据库失败:', error);
    throw error;
  } finally {
    await adminDb.destroy();
  }
}

async function ensureTablesExist() {
  const testDb = knex({
    client: 'mysql2',
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: TEST_DB_NAME,
    },
  });

  try {
    const [tables] = await testDb.raw('SHOW TABLES');
    const tableNames = tables.map((t: any) => Object.values(t)[0]);
    
    const requiredTables = ['users', 'sessions', 'machines', 'credit_history', 'operation_logs', 'request_logs', 'webhook_events'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));
    
    if (missingTables.length === 0) {
      console.log('所有必需的表已存在');
      return;
    }
    
    console.log('缺少表:', missingTables.join(', '));
    console.log('从主数据库复制表结构...');
    
    const mainDb = knex({
      client: 'mysql2',
      connection: {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: MAIN_DB_NAME,
      },
    });
    
    try {
      const [mainTables] = await mainDb.raw('SHOW TABLES');
      const mainTableNames = mainTables.map((t: any) => Object.values(t)[0]);
      
      for (const tableName of mainTableNames) {
        if (tableName === 'knex_migrations' || tableName === 'knex_migrations_lock') continue;
        if (tableNames.includes(tableName)) continue;
        
        try {
          const [createTableResult] = await mainDb.raw('SHOW CREATE TABLE ??', tableName);
          const createStatement = createTableResult[0]['Create Table'];
          await testDb.raw(createStatement);
          console.log(`  创建表成功: ${tableName}`);
        } catch (err) {
          console.error(`  创建表失败: ${tableName}`, err);
        }
      }
      
      console.log('表结构复制完成');
    } finally {
      await mainDb.destroy();
    }
  } catch (error) {
    console.error('检查/创建表失败:', error);
    throw error;
  } finally {
    await testDb.destroy();
  }
}

async function main() {
  console.log('========================================');
  console.log('初始化测试数据库');
  console.log('========================================');
  
  try {
    await ensureTestDatabase();
    await ensureTablesExist();
    console.log('========================================');
    console.log('测试数据库初始化完成');
    console.log('========================================');
    process.exit(0);
  } catch (error) {
    console.error('初始化失败:', error);
    process.exit(1);
  }
}

main();
