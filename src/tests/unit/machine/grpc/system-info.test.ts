import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('system-info module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCpuUsage should return a number between 0 and 100', async () => {
    const { getCpuUsage } = await import('../../../../machine/grpc/system-info.js');
    const cpuUsage = getCpuUsage();
    expect(typeof cpuUsage).toBe('number');
    expect(cpuUsage).toBeGreaterThanOrEqual(0);
    expect(cpuUsage).toBeLessThanOrEqual(100);
  });

  it('getMemoryUsage should return a number between 0 and 100', async () => {
    const { getMemoryUsage } = await import('../../../../machine/grpc/system-info.js');
    const memUsage = getMemoryUsage();
    expect(typeof memUsage).toBe('number');
    expect(memUsage).toBeGreaterThanOrEqual(0);
    expect(memUsage).toBeLessThanOrEqual(100);
  });

  it('getLocalIpAddress should return a string', async () => {
    const { getLocalIpAddress } = await import('../../../../machine/grpc/system-info.js');
    const ip = getLocalIpAddress();
    expect(typeof ip).toBe('string');
    expect(ip.length).toBeGreaterThan(0);
  });

  it('getDiskUsage should return a number', async () => {
    const { getDiskUsage } = await import('../../../../machine/grpc/system-info.js');
    const diskUsage = await getDiskUsage();
    expect(typeof diskUsage).toBe('number');
    expect(diskUsage).toBeGreaterThanOrEqual(0);
  });

  it('getDiskSpace should return a number', async () => {
    const { getDiskSpace } = await import('../../../../machine/grpc/system-info.js');
    const diskSpace = await getDiskSpace();
    expect(typeof diskSpace).toBe('number');
    expect(diskSpace).toBeGreaterThan(0);
  });

  it('getCpuUsage should return consistent values on repeated calls', async () => {
    const { getCpuUsage } = await import('../../../../machine/grpc/system-info.js');
    const results = [getCpuUsage(), getCpuUsage(), getCpuUsage()];
    for (const val of results) {
      expect(typeof val).toBe('number');
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });
});
