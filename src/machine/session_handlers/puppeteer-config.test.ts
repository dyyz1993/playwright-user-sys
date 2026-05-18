import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({
  CONFIG: { chromePath: '/mock/chrome/path' },
}));

vi.mock('@shared/utils/logger.js', () => ({
  logger: { info: vi.fn() },
}));

const { convertPuppeteerOptions } = await import('./puppeteer-config.js');

describe('convertPuppeteerOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return default options when called with empty object', async () => {
    const result = await convertPuppeteerOptions({});
    expect(result.headless).toBe(true);
    expect(result.executablePath).toBe('/mock/chrome/path');
    expect(result.protocolTimeout).toBe(60000);
    expect(result.args).toContain('--no-sandbox');
    expect(result.args).toContain('--headless=new');
    expect(result.args).toContain('--disable-blink-features=AutomationControlled');
    expect(result.defaultViewport).toEqual({ width: 1280, height: 800, deviceScaleFactor: 1 });
  });

  it('should set defaultViewport from viewport option', async () => {
    const result = await convertPuppeteerOptions({ viewport: { width: 1920, height: 1080 } });
    expect(result.defaultViewport).toEqual({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    expect(result.args).toContain('--window-size=1920,1080');
  });

  it('should handle defaultViewport option directly', async () => {
    const dv = { width: 800, height: 600, deviceScaleFactor: 2 };
    const result = await convertPuppeteerOptions({ defaultViewport: dv });
    expect(result.defaultViewport).toEqual(dv);
  });

  it('should add userDataDir arg', async () => {
    const result = await convertPuppeteerOptions({ userDataDir: '/tmp/data' });
    expect(result.args).toContain('--user-data-dir=/tmp/data');
  });

  it('should add proxy arg', async () => {
    const result = await convertPuppeteerOptions({ proxy: 'http://proxy:8080' });
    expect(result.args).toContain('--proxy-server=http://proxy:8080');
  });

  it('should add proxyBypass arg', async () => {
    const result = await convertPuppeteerOptions({ proxyBypass: 'localhost,127.0.0.1' });
    expect(result.args).toContain('--proxy-bypass-list=localhost,127.0.0.1');
  });

  it('should add userAgent arg', async () => {
    const result = await convertPuppeteerOptions({ userAgent: 'Mozilla/5.0' });
    expect(result.args).toContain('--user-agent=Mozilla/5.0');
  });

  it('should append custom args', async () => {
    const result = await convertPuppeteerOptions({ args: ['--flag1', '--flag2'] });
    expect(result.args).toContain('--flag1');
    expect(result.args).toContain('--flag2');
  });

  it('should not include duplicate --disable-setuid-sandbox', async () => {
    const result = await convertPuppeteerOptions({});
    const count = result.args!.filter((a) => a === '--disable-setuid-sandbox').length;
    expect(count).toBe(1);
  });
});
