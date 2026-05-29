import type { HeartbeatHandle } from '../ws-heartbeat.js';

export class ConnectionManager {
  private activeConnections: Set<string> = new Set();
  private connectionTimestamps: Map<string, number> = new Map();
  private heartbeatHandles: Map<string, HeartbeatHandle> = new Map();
  readonly maxConnections: number;

  constructor(maxConnections: number = 1000) {
    this.maxConnections = maxConnections;
  }

  isAtCapacity(): boolean {
    return this.activeConnections.size >= this.maxConnections;
  }

  has(sessionId: string): boolean {
    return this.activeConnections.has(sessionId);
  }

  add(sessionId: string): void {
    this.activeConnections.add(sessionId);
    this.connectionTimestamps.set(sessionId, Date.now());
  }

  remove(sessionId: string): void {
    this.activeConnections.delete(sessionId);
    this.connectionTimestamps.delete(sessionId);
    const hb = this.heartbeatHandles.get(sessionId);
    if (hb) {
      hb.stop();
      this.heartbeatHandles.delete(sessionId);
    }
  }

  setHeartbeat(sessionId: string, handle: HeartbeatHandle): void {
    this.heartbeatHandles.set(sessionId, handle);
  }

  getHeartbeat(sessionId: string): HeartbeatHandle | undefined {
    return this.heartbeatHandles.get(sessionId);
  }

  removeHeartbeat(sessionId: string): void {
    const hb = this.heartbeatHandles.get(sessionId);
    if (hb) {
      hb.stop();
      this.heartbeatHandles.delete(sessionId);
    }
  }

  updateTimestamp(sessionId: string): void {
    this.connectionTimestamps.set(sessionId, Date.now());
  }

  getActiveConnectionCount(): number {
    return this.activeConnections.size;
  }

  getStaleSessionIds(staleMs: number): string[] {
    const now = Date.now();
    const stale: string[] = [];
    for (const [sid, ts] of this.connectionTimestamps.entries()) {
      if (now - ts > staleMs) {
        stale.push(sid);
      }
    }
    return stale;
  }

  getAllSessionIds(): string[] {
    return [...this.activeConnections];
  }

  getActiveSet(): Set<string> {
    return this.activeConnections;
  }
}
