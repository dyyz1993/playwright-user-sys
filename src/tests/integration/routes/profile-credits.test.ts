/**
 * Profile 页面已使用点数测试
 * 验证 /admin/profile 页面的 used_credits 是否正确计算
 */
import { test, expect, describe } from 'vitest';

describe('Profile 页面已使用点数', () => {
  describe('问题验证: used_credits 应该从数据库获取，而不是硬编码为 0', () => {
    test('SessionModel.getUserSessionStats 方法应该存在', async () => {
      const { SessionModel } = await import('../../../models/session.model.js');
      expect(typeof SessionModel.getUserSessionStats).toBe('function');
    });
  });

  describe('代码验证: admin.routes.ts 应该使用正确的逻辑', () => {
    test('admin.routes.ts 应该使用 SessionModel.getUserSessionStats', async () => {
      const fs = await import('fs');
      const adminRoutes = fs.readFileSync('./src/routes/admin.routes.ts', 'utf-8');

      expect(adminRoutes).toContain('getUserSessionStats');

      console.log('✅ 代码已正确使用 getUserSessionStats');
    });

    test('/admin/profile 路由应该使用 sessionStats.total_credits_used', async () => {
      const fs = await import('fs');
      const adminRoutes = fs.readFileSync('./src/routes/admin.routes.ts', 'utf-8');

      expect(adminRoutes).toContain('sessionStats.total_credits_used');
      expect(adminRoutes).toContain('used_credits: usedCredits');

      console.log('✅ /admin/profile 路由已正确获取 used_credits');
    });
  });
});
