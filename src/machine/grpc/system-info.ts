import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@shared/utils/logger.js';

let lastCpuInfo: { idle: number; total: number } | null = null;

export function getCpuUsage(): number {
  try {
    const cpus = os.cpus();

    if (!cpus || cpus.length === 0) {
      return 0;
    }

    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times];
      }
      idle += cpu.times.idle;
    }

    if (!lastCpuInfo) {
      lastCpuInfo = { idle, total };
      const loadavg = os.loadavg()[0];
      const cpuCount = cpus.length;
      return Math.min((loadavg / cpuCount) * 100, 100);
    }

    const idleDiff = idle - lastCpuInfo.idle;
    const totalDiff = total - lastCpuInfo.total;

    lastCpuInfo = { idle, total };

    const cpuUsage = totalDiff > 0 ? 100 - (idleDiff / totalDiff) * 100 : 0;

    return Math.min(Math.max(cpuUsage, 0), 100);
  } catch (error: unknown) {
    logger.error('计算CPU使用率失败:', error);
    try {
      const loadavg = os.loadavg()[0];
      const cpuCount = os.cpus().length;
      return Math.min((loadavg / cpuCount) * 100, 100);
    } catch (fallbackError: unknown) {
      logger.error('获取系统负载失败，使用默认CPU使用率:', fallbackError);
      return 50;
    }
  }
}

export function getMemoryUsage(): number {
  return ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
}

export function getLocalIpAddress(): string {
  const envIp = process.env.MACHINE_IP;
  if (envIp) {
    return envIp;
  }
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

export async function getDiskSpace(): Promise<number> {
  try {
    const execAsync = promisify(exec);
    let command = '';

    if (os.platform() === 'win32') {
      command = 'wmic logicaldisk get size';
    } else if (os.platform() === 'darwin') {
      command = "df -k / | tail -1 | awk '{ print $2 }'";
    } else {
      command = "df -k / | tail -1 | awk '{ print $2 }'";
    }

    const { stdout } = await execAsync(command);

    if (os.platform() === 'win32') {
      const lines = stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim() !== 'Size');
      if (lines.length > 0) {
        const size = parseInt(lines[0].trim(), 10);
        return isNaN(size) ? 1000000000 : size;
      }
    } else {
      const size = parseInt(stdout.trim(), 10) * 1024;
      return isNaN(size) ? 1000000000 : size;
    }

    return 1000000000;
  } catch (error: unknown) {
    logger.error('获取磁盘空间失败:', error);
    return 1000000000;
  }
}

export async function getDiskUsage(): Promise<number> {
  try {
    const execAsync = promisify(exec);
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
  } catch (error: unknown) {
    logger.error('获取磁盘使用率失败:', error);
    return 50;
  }
}
