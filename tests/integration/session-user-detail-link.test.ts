import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test('会话详情页面的"查看用户详情"链接应该指向正确的路由', async (t) => {
  await t.test('验证 session-detail.ejs 模板中的链接格式正确', async () => {
    const templatePath = path.join(process.cwd(), 'src/views/pages/session-detail.ejs');
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    const correctLink = '/admin/users/<%= session.user_id %>/edit';

    assert.ok(templateContent.includes(correctLink), `模板应该包含正确的链接格式: ${correctLink}`);
  });
});
