import knex from 'knex';

async function testMySQL() {
  try {
    console.log('测试 MySQL 连接...');

    const db = knex({
      client: 'mysql2',
      connection: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'mysql',
      },
      pool: {
        min: 2,
        max: 10,
      },
    });

    // 检查连接
    try {
      await db.raw('SELECT 1 as result');
      console.log('MySQL 连接成功!');

      // 尝试创建测试表
      try {
        // 检查表是否存在，如果存在则删除
        const tableExists = await db.schema.hasTable('test');
        if (tableExists) {
          await db.schema.dropTable('test');
          console.log('删除已存在的测试表');
        }

        // 创建测试表
        await db.schema.createTable('test', (table) => {
          table.increments('id').primary();
          table.string('name');
        });
        console.log('测试表创建成功');

        // 插入测试数据
        await db('test').insert({ name: 'test1' });
        console.log('测试数据插入成功');

        // 查询测试数据
        const result = await db('test').select('*');
        console.log('MySQL 测试结果:', result);

        // 删除测试表
        await db.schema.dropTable('test');
        console.log('测试表删除成功');
      } catch (error) {
        console.error('测试表操作失败:', error);
      }
    } catch (error) {
      console.error('MySQL 连接失败:', error);
    } finally {
      // 关闭连接
      await db.destroy();
      console.log('MySQL 连接已关闭');
    }
  } catch (error) {
    console.error('测试 MySQL 连接失败:', error);
  }
}

testMySQL();
