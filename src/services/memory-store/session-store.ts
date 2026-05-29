import { SessionStatus } from '@shared/types/index.js';
import type { SessionRealTimeStatus } from './types.js';

export class SessionStore {
  private sessions: Map<string, SessionRealTimeStatus> = new Map();

  get(sessionId: string): SessionRealTimeStatus | undefined {
    return this.sessions.get(sessionId);
  }

  set(sessionId: string, session: SessionRealTimeStatus): void {
    this.sessions.set(sessionId, session);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  getAll(): SessionRealTimeStatus[] {
    return Array.from(this.sessions.values());
  }

  getActive(): SessionRealTimeStatus[] {
    return this.getAll().filter((s) => s.status === SessionStatus.CREATED || s.status === SessionStatus.CONNECTED);
  }

  getStats(): { total: number; active: number; completed: number; error: number; expired: number } {
    const sessions = this.getAll();
    const active = sessions.filter(
      (s) => s.status === SessionStatus.CREATED || s.status === SessionStatus.CONNECTED
    ).length;
    const completed = sessions.filter((s) => s.status === SessionStatus.COMPLETED).length;
    const error = sessions.filter((s) => s.status === SessionStatus.ERROR).length;
    const expired = sessions.filter((s) => s.status === SessionStatus.EXPIRED).length;

    return { total: sessions.length, active, completed, error, expired };
  }

  entries(): IterableIterator<[string, SessionRealTimeStatus]> {
    return this.sessions.entries();
  }

  values(): IterableIterator<SessionRealTimeStatus> {
    return this.sessions.values();
  }

  get size(): number {
    return this.sessions.size;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  clear(): void {
    this.sessions.clear();
  }

  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxAgeMs);

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status !== SessionStatus.CREATED && session.status !== SessionStatus.CONNECTED) {
        if (session.last_activity < cutoffTime) {
          this.sessions.delete(sessionId);
        }
      }
    }
  }
}
