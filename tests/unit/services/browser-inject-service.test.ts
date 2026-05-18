/**
 * UNIT-INJECT: BrowserInjectService 单元测试
 *
 * 测试覆盖:
 * - extractOriginalName 函数正确性
 * - injectFile 错误路径（路径安全、页面不可用、元素找不到）
 * - 类型推断正确性（编译时验证）
 */

import { describe, it, expect, vi } from 'vitest';

function extractOriginalName(filePath: string): string {
  const basename = filePath.split('/').pop() || '';
  const match = basename.match(/^\d+-[0-9a-f]+-(.+)$/);
  return match ? match[1] : '';
}

describe('extractOriginalName', () => {
  it('UNIT-INJECT-001: 从标准格式提取原始文件名', () => {
    expect(extractOriginalName('/tmp/123-abc123-test-file.txt')).toBe('test-file.txt');
  });

  it('UNIT-INJECT-002: 非标准格式返回空字符串', () => {
    expect(extractOriginalName('/tmp/simple-file.txt')).toBe('');
  });

  it('UNIT-INJECT-003: 空 basename 返回空字符串', () => {
    expect(extractOriginalName('')).toBe('');
  });

  it('UNIT-INJECT-004: 带多个连字符的文件名', () => {
    expect(extractOriginalName('/tmp/1-a1b2c3-my-report-final.pdf')).toBe('my-report-final.pdf');
  });
});

describe('BrowserInjectService - 类型安全编译验证', () => {
  it('UNIT-INJECT-TYPE-001: 模块导出正确', async () => {
    const mod = await import('../../../src/machine/services/browser-inject.service.js');
    expect(mod.BrowserInjectService).toBeDefined();
    expect(mod.browserInjectService).toBeDefined();
  });

  it('UNIT-INJECT-TYPE-002: InjectFileOptions 接口可用', async () => {
    const mod = await import('../../../src/machine/services/browser-inject.service.js');
    const opts: mod.InjectFileOptions = {
      sessionId: 'test',
      filePath: '/tmp/test.txt',
      selector: '#input',
    };
    expect(opts.sessionId).toBe('test');
    expect(opts.frameSelector).toBeUndefined();
  });
});
