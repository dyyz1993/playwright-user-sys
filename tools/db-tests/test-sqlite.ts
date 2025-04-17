import knex from 'knex';

async function testSQLite() {
  try {
    console.log('测试 SQLite 连接...');
    
    // 尝试使用 sqlite3
    try {
      console.log('尝试使用 sqlite3...');
      const db1 = knex({
        client: 'sqlite3',
        connection: {
          filename: ':memory:',
        },
        useNullAsDefault: true,
      });
      
      // 创建测试表
      await db1.schema.createTable('test', (table) => {
        table.increments('id').primary();
        table.string('name');
      });
      
      // 插入测试数据
      await db1('test').insert({ name: 'test1' });
      
      // 查询测试数据
      const result1 = await db1('test').select('*');
      console.log('sqlite3 测试结果:', result1);
      
      // 关闭连接
      await db1.destroy();
      console.log('sqlite3 测试成功!');
    } catch (error) {
      console.error('sqlite3 测试失败:', error);
    }
    
    // 尝试使用 better-sqlite3
    try {
      console.log('尝试使用 better-sqlite3...');
      const db2 = knex({
        client: 'better-sqlite3',
        connection: {
          filename: ':memory:',
        },
        useNullAsDefault: true,
      });
      
      // 创建测试表
      await db2.schema.createTable('test', (table) => {
        table.increments('id').primary();
        table.string('name');
      });
      
      // 插入测试数据
      await db2('test').insert({ name: 'test2' });
      
      // 查询测试数据
      const result2 = await db2('test').select('*');
      console.log('better-sqlite3 测试结果:', result2);
      
      // 关闭连接
      await db2.destroy();
      console.log('better-sqlite3 测试成功!');
    } catch (error) {
      console.error('better-sqlite3 测试失败:', error);
    }
    
    console.log('SQLite 测试完成');
  } catch (error) {
    console.error('测试 SQLite 连接失败:', error);
  }
}

testSQLite();
