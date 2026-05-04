/**
 * 验证 profile 页面已使用点数修复
 * 直接测试 SessionModel.getUserSessionStats 方法
 */
import { SessionModel } from '../src/models/session.model.js';
import { db } from '../src/config/database.js';

async function main() {
  try {
    console.log('=== 验证 Profile 页面已使用点数修复 ===\n');

    const userId = 1;

    console.log(`1. 测试 SessionModel.getUserSessionStats(${userId})...`);
    const stats = await SessionModel.getUserSessionStats(userId);
    console.log('   结果:', stats);
    console.log('   已使用点数:', stats.total_credits_used);

    console.log('\n2. 直接查询数据库验证...');
    const result = await db('sessions')
      .where('user_id', userId)
      .select(
        db.raw('COUNT(*) as total_sessions'),
        db.raw('COALESCE(SUM(duration), 0) as total_duration'),
        db.raw('COALESCE(SUM(credits_used), 0) as total_credits_used')
      )
      .first();
    console.log('   数据库结果:', result);

    console.log('\n3. 验证结果...');
    if (stats.total_credits_used === Number(result.total_credits_used)) {
      console.log('   ✅ 修复成功! SessionModel.getUserSessionStats 返回正确的值');
      console.log(`   已使用点数: ${stats.total_credits_used}`);
    } else {
      console.log('   ❌ 修复失败! 值不匹配');
      console.log(`   SessionModel: ${stats.total_credits_used}`);
      console.log(`   数据库: ${result.total_credits_used}`);
    }

    console.log('\n4. 检查修复后的代码...');
    const fs = await import('fs');
    const adminRoutes = fs.readFileSync('./src/routes/admin.routes.ts', 'utf-8');
    
    if (adminRoutes.includes('getUserSessionStats')) {
      console.log('   ✅ admin.routes.ts 已使用 getUserSessionStats');
    } else {
      console.log('   ❌ admin.routes.ts 未使用 getUserSessionStats');
    }

    if (adminRoutes.includes('usedCredits = 0')) {
      console.log('   ❌ 仍然存在硬编码 usedCredits = 0');
    } else {
      console.log('   ✅ 已移除硬编码 usedCredits = 0');
    }

    process.exit(0);
  } catch (error) {
    console.error('验证失败:', error);
    process.exit(1);
  }
}

main();
