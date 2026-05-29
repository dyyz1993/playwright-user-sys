import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { logger } from '@shared/utils/logger.js';

const machineEnvSchema = z.object({
  MACHINE_GRPC_PORT: z.coerce.number().int().min(1).max(65535).default(50052),
  PROXY_PORT: z.coerce.number().int().min(1).max(65535).default(8082),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  MAX_SESSIONS: z.coerce.number().int().positive().default(10),
  SESSION_TIMEOUT: z.coerce.number().int().positive().default(300000),
  HEARTBEAT_INTERVAL: z.coerce.number().int().positive().default(30000),
  DISCONNECTION_TIMEOUT: z.coerce.number().int().positive().default(10000),
  ACTIVITY_REPORT_INTERVAL: z.coerce.number().int().positive().default(3000),
  SESSION_ACTIVITY_TIMEOUT: z.coerce.number().int().positive().default(10000),
});

const _validated = machineEnvSchema.safeParse(process.env);
if (!_validated.success) {
  logger.error('Machine config validation failed:', _validated.error.format());
  throw new Error('Machine config validation failed');
}
const validatedEnv = _validated.data;

export interface MachineConfig {
  machineId: string;
  machineName: string;
  managerHost: string;
  grpcPort: number;
  proxyPort: number;
  maxSessions: number;
  sessionTimeout: number;
  chromePath: string;
  heartbeatInterval: number;
  disconnectionTimeout: number;
  activityReportInterval: number;
  sessionActivityTimeout: number;
  dataDir: string;
  tempDir: string;
}

const env = process.env;

const dataDir = env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const tempDir = path.join(dataDir, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

export function loadConfig(): MachineConfig {
  return {
    machineId: env.MACHINE_ID || uuidv4(),
    machineName: env.MACHINE_NAME || os.hostname(),

    managerHost: env.MANAGER_HOST || 'localhost:50051',
    grpcPort: validatedEnv.MACHINE_GRPC_PORT,
    proxyPort: validatedEnv.PROXY_PORT,

    maxSessions: validatedEnv.MAX_SESSIONS,
    sessionTimeout: validatedEnv.SESSION_TIMEOUT,
    chromePath:
      env.CHROME_PATH ||
      (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : process.platform === 'linux'
          ? '/usr/bin/google-chrome-stable'
          : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'),

    heartbeatInterval: validatedEnv.HEARTBEAT_INTERVAL,

    disconnectionTimeout: validatedEnv.DISCONNECTION_TIMEOUT,

    activityReportInterval: validatedEnv.ACTIVITY_REPORT_INTERVAL,

    sessionActivityTimeout: validatedEnv.SESSION_ACTIVITY_TIMEOUT,

    dataDir: dataDir,

    tempDir: tempDir,
  };
}

export const CONFIG = loadConfig();

export default CONFIG;
