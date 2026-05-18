import { db } from '../config/database.js';
import { logger } from '@shared/utils/logger.js';

export interface MetricsMemory {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}

export interface MetricsResponse {
  timestamp: string;
  uptime: number;
  memory: MetricsMemory;
  sessions: {
    active: number;
    total: number;
  };
  machines: {
    registered: number;
    online: number;
  };
  websocket: {
    activeConnections: number;
  };
}

export interface ComponentStatus {
  status: 'ok' | 'error' | 'disabled';
  responseTime?: number;
  activeConnections?: number;
  machines?: number;
  error?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  dbDriver: string;
  dbType: string;
  components: {
    database: ComponentStatus;
    websocket: ComponentStatus;
    grpc: ComponentStatus;
  };
}

interface ComponentResults {
  database: ComponentStatus;
  websocket: ComponentStatus;
  grpc: ComponentStatus;
}

function determineOverallStatus(components: ComponentResults): 'ok' | 'degraded' | 'unhealthy' {
  const statuses = Object.values(components).map((c) => c.status);
  if (statuses.every((s) => s === 'ok' || s === 'disabled')) return 'ok';
  if (statuses.some((s) => s === 'error')) return 'degraded';
  return 'ok';
}

export async function checkDatabase(): Promise<ComponentStatus> {
  try {
    const start = Date.now();
    await db.raw('SELECT 1');
    return { status: 'ok', responseTime: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database check failed';
    logger.error(`Health check - database error: ${message}`);
    return { status: 'error', error: message };
  }
}

export function checkWebSocket(activeConnections: number): ComponentStatus {
  try {
    return { status: 'ok', activeConnections };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'WebSocket check failed';
    return { status: 'error', error: message };
  }
}

export async function checkGrpc(
  getActiveConnections: () => string[],
  getRegisteredMachineCount: () => Promise<number>
): Promise<ComponentStatus> {
  try {
    const activeConnections = getActiveConnections();
    const machines = await getRegisteredMachineCount();
    return {
      status: activeConnections.length > 0 ? 'ok' : 'disabled',
      machines,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'gRPC check failed';
    logger.error(`Health check - gRPC error: ${message}`);
    return { status: 'error', error: message };
  }
}

const startTime = Date.now();

export async function getHealthStatus(deps?: {
  getActiveWsConnections?: () => number;
  getGrpcActiveConnections?: () => string[];
  getRegisteredMachineCount?: () => Promise<number>;
  getSqliteClient?: () => string;
}): Promise<HealthResponse> {
  const getSqliteClient = deps?.getSqliteClient ?? (() => process.env.DB_DRIVER || 'better-sqlite3');

  const [database, grpc] = await Promise.all([
    checkDatabase(),
    checkGrpc(deps?.getGrpcActiveConnections ?? (() => []), deps?.getRegisteredMachineCount ?? (async () => 0)),
  ]);

  const wsConnectionCount = deps?.getActiveWsConnections?.() ?? 0;
  const websocket = checkWebSocket(wsConnectionCount);

  const components = { database, websocket, grpc };

  return {
    status: determineOverallStatus(components),
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    dbDriver: getSqliteClient(),
    dbType: process.env.DB_TYPE || 'sqlite',
    components,
  };
}

export async function getMetrics(deps?: { getActiveWsConnections?: () => number }): Promise<MetricsResponse> {
  const mem = process.memoryUsage();
  const wsConnectionCount = deps?.getActiveWsConnections?.() ?? 0;

  let activeSessions = 0;
  let totalSessions = 0;
  let registeredMachines = 0;
  let onlineMachines = 0;

  try {
    const { statsMethods } = await import('../models/session/session-stats.model.js');
    [activeSessions, totalSessions] = await Promise.all([statsMethods.countActiveSessions(), statsMethods.countAll()]);
  } catch {
    logger.warn('Metrics: session stats unavailable');
  }

  try {
    const { MachineModel } = await import('../models/machine.model.js');
    [registeredMachines, onlineMachines] = await Promise.all([MachineModel.countAll(), MachineModel.countOnline()]);
  } catch {
    logger.warn('Metrics: machine stats unavailable');
  }

  return {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
    sessions: {
      active: activeSessions,
      total: totalSessions,
    },
    machines: {
      registered: registeredMachines,
      online: onlineMachines,
    },
    websocket: {
      activeConnections: wsConnectionCount,
    },
  };
}
