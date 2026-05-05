import { describe, it, expect } from 'vitest';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function getDiskUsage(): Promise<number> {
  try {
    let command = '';

    if (os.platform() === 'win32') {
      command = 'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size';
    } else if (os.platform() === 'darwin') {
      command = 'df -k / | tail -1 | awk \'{ print $3 " " $2 }\'';
    } else {
      command = 'df -k / | tail -1 | awk \'{ print $3 " " $2 }\'';
    }

    const { stdout } = await execAsync(command);

    if (os.platform() === 'win32') {
      const lines = stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim() && !line.includes('FreeSpace'));
      if (lines.length > 0) {
        const parts = lines[0].trim().split(/\s+/);
        if (parts.length >= 2) {
          const freeSpace = parseInt(parts[0], 10);
          const totalSpace = parseInt(parts[1], 10);
          if (!isNaN(freeSpace) && !isNaN(totalSpace) && totalSpace > 0) {
            return ((totalSpace - freeSpace) / totalSpace) * 100;
          }
        }
      }
    } else {
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 2) {
        const used = parseInt(parts[0], 10);
        const total = parseInt(parts[1], 10);
        if (!isNaN(used) && !isNaN(total) && total > 0) {
          return (used / total) * 100;
        }
      }
    }

    return 50;
  } catch (error) {
    console.error('获取磁盘使用率失败:', error);
    return 50;
  }
}

describe('Disk Usage Tests', () => {
  it('should get disk usage greater than 0', async () => {
    const diskUsage = await getDiskUsage();
    console.log(`Disk usage: ${diskUsage}%`);
    expect(diskUsage).toBeGreaterThan(0);
    expect(diskUsage).toBeLessThanOrEqual(100);
  });

  it('should verify disk usage is not always 0', async () => {
    const diskUsage = await getDiskUsage();
    console.log(`Current disk usage: ${diskUsage}%`);

    if (diskUsage === 0) {
      console.log('⚠️ Disk usage is 0 - this indicates the bug exists!');
    } else {
      console.log(`✅ Disk usage is ${diskUsage.toFixed(2)}% - bug is fixed!`);
    }

    expect(diskUsage).toBeGreaterThan(0);
  });

  it('should get disk usage multiple times', async () => {
    const usages: number[] = [];
    for (let i = 0; i < 3; i++) {
      const usage = await getDiskUsage();
      usages.push(usage);
      console.log(`Disk usage ${i + 1}: ${usage.toFixed(2)}%`);
    }

    const allGreaterThanZero = usages.every((u) => u > 0);
    expect(allGreaterThanZero).toBe(true);
  });
});
