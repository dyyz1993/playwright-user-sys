#!/usr/bin/env node

/**
 * JWT Import Verification Script
 *
 * 验证不同 JWT 导入方式的正确性
 */

import assert from 'assert';

console.log('='.repeat(60));
console.log('JWT Import Verification');
console.log('='.repeat(60));

// 测试 1: 默认导入
console.log('\n[Test 1] Default import:');
try {
  const jwtDefault = await import('jsonwebtoken');
  assert.strictEqual(typeof jwtDefault.default, 'object', 'jwt.default should be object');
  assert.strictEqual(typeof jwtDefault.default.sign, 'function', 'jwt.default.sign should be function');
  assert.strictEqual(typeof jwtDefault.default.verify, 'function', 'jwt.default.verify should be function');
  console.log('  ✓ Default import works correctly');
  console.log('  - jwt.default.sign:', typeof jwtDefault.default.sign);
  console.log('  - jwt.default.verify:', typeof jwtDefault.default.verify);
} catch (err) {
  console.error('  ✗ Default import failed:', err.message);
  process.exit(1);
}

// 测试 2: 命名导入（会失败）
console.log('\n[Test 2] Named import (expected to fail):');
try {
  const jwtNamed = await import('jsonwebtoken');
  const { sign } = jwtNamed;
  if (typeof sign !== 'function') {
    console.log('  ✓ Confirmed: Named import returns undefined (as expected)');
    console.log('  - typeof sign:', typeof sign);
  } else {
    console.log('  ! Unexpected: Named import worked');
  }
} catch (err) {
  console.error('  ✗ Unexpected error:', err.message);
}

// 测试 3: 使用 default 生成 token
console.log('\n[Test 3] Token generation with jwt.default.sign:');
try {
  const jwt = await import('jsonwebtoken');
  const payload = { id: 1, username: 'test', role: 'user' };
  const secret = 'test-secret-key';

  const token = jwt.default.sign(payload, secret, { expiresIn: '1h' });

  assert.ok(typeof token === 'string', 'Token should be string');
  assert.ok(token.length > 0, 'Token should not be empty');
  assert.ok(token.split('.').length === 3, 'Token should have 3 parts (JWT format)');

  console.log('  ✓ Token generated successfully');
  console.log('  - Token format:', token.split('.')[0] + '...' + token.split('.').pop());
  console.log('  - Token length:', token.length, 'chars');

  // 验证 token
  const decoded = jwt.default.verify(token, secret);
  assert.strictEqual(decoded.id, payload.id, 'Decoded id should match');
  assert.strictEqual(decoded.username, payload.username, 'Decoded username should match');
  assert.strictEqual(decoded.role, payload.role, 'Decoded role should match');
  console.log('  ✓ Token verified successfully');
  console.log('  - Decoded payload:', JSON.stringify(decoded));
} catch (err) {
  console.error('  ✗ Token generation/verification failed:', err.message);
  process.exit(1);
}

// 测试 4: 项目工具函数
console.log('\n[Test 4] Project utility function:');
try {
  const { generateToken, verifyToken } = await import('../src/utils/auth.js');

  const payload = { id: 1, username: 'test', role: 'user' };
  const token = generateToken(payload);

  assert.ok(typeof token === 'string', 'Token should be string');
  assert.ok(token.length > 0, 'Token should not be empty');
  console.log('  ✓ generateToken works correctly');

  const decoded = verifyToken(token);
  assert.ok(decoded !== null, 'Token should be verifiable');
  assert.strictEqual(decoded.id, payload.id, 'Decoded id should match');
  console.log('  ✓ verifyToken works correctly');
  console.log('  - Decoded payload:', JSON.stringify(decoded));
} catch (err) {
  console.error('  ✗ Utility functions failed:', err.message);
  console.error('  Stack:', err.stack);
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('All JWT import tests passed!');
console.log('='.repeat(60));
console.log('\nRecommendations:');
console.log('1. Use "jwt.default.sign()" for dynamic imports');
console.log('2. Or use "generateToken()" utility function');
console.log('3. Avoid named imports from "jsonwebtoken"');
console.log('='.repeat(60));
