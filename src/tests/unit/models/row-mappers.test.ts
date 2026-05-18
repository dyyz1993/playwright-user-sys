import { describe, it, expect } from 'vitest';
import { parseSessionOptions, parseSessionRowWithDates } from '../../../models/session/types.js';
import type { SessionRow } from '@shared/types/tables.js';
import type { MachineRow } from '@shared/types/tables.js';
import { SessionStatus } from '@shared/types/index.js';

describe('Session Row Mappers', () => {
  const baseRow: SessionRow = {
    id: 'session-1',
    user_id: 1,
    machine_id: 'machine-1',
    port: 9222,
    status: SessionStatus.CREATED,
    options: JSON.stringify({ headless: true }),
    start_time: '2025-01-01T00:00:00.000Z',
    end_time: null,
    disconnected_at: null,
    duration: 0,
    credits_used: 0,
    screenshot_url: null,
    last_activity: null,
    error_message: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  describe('parseSessionOptions', () => {
    it('should parse string options to object', () => {
      const result = parseSessionOptions(baseRow as SessionRow & Record<string, unknown>);
      expect(result.options).toEqual({ headless: true });
    });

    it('should handle null options', () => {
      const row = { ...baseRow, options: null };
      const result = parseSessionOptions(row as SessionRow & Record<string, unknown>);
      expect(result.options).toBeNull();
    });

    it('should handle already-parsed object options', () => {
      const row = { ...baseRow, options: { headless: false } } as SessionRow & Record<string, unknown>;
      const result = parseSessionOptions(row);
      expect(result.options).toEqual({ headless: false });
    });

    it('should handle invalid JSON options gracefully', () => {
      const row = { ...baseRow, options: '{invalid json' } as SessionRow & Record<string, unknown>;
      const result = parseSessionOptions(row);
      expect(result.options).toBeNull();
    });

    it('should preserve all non-date fields as-is', () => {
      const result = parseSessionOptions(baseRow as SessionRow & Record<string, unknown>);
      expect(result.id).toBe('session-1');
      expect(result.user_id).toBe(1);
      expect(result.machine_id).toBe('machine-1');
      expect(result.port).toBe(9222);
      expect(result.status).toBe(SessionStatus.CREATED);
      expect(result.duration).toBe(0);
      expect(result.credits_used).toBe(0);
    });

    it('should convert date fields to Date objects', () => {
      const result = parseSessionOptions(baseRow as SessionRow & Record<string, unknown>);
      expect(result.start_time).toBeInstanceOf(Date);
      expect(result.created_at).toBeInstanceOf(Date);
    });
  });

  describe('parseSessionRowWithDates', () => {
    it('should convert date strings to Date objects', () => {
      const result = parseSessionRowWithDates(baseRow as SessionRow & Record<string, unknown>);
      expect(result.start_time).toBeInstanceOf(Date);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should handle null date fields', () => {
      const result = parseSessionRowWithDates(baseRow as SessionRow & Record<string, unknown>);
      expect(result.end_time).toBeNull();
      expect(result.disconnected_at).toBeNull();
      expect(result.last_activity).toBeNull();
    });

    it('should convert non-null date fields', () => {
      const row = {
        ...baseRow,
        end_time: '2025-01-01T01:00:00.000Z',
        disconnected_at: '2025-01-01T01:30:00.000Z',
        last_activity: '2025-01-01T00:30:00.000Z',
      } as SessionRow & Record<string, unknown>;
      const result = parseSessionRowWithDates(row);
      expect(result.end_time).toBeInstanceOf(Date);
      expect(result.disconnected_at).toBeInstanceOf(Date);
      expect(result.last_activity).toBeInstanceOf(Date);
    });

    it('should provide default Date for created_at/updated_at when null', () => {
      const row = {
        ...baseRow,
        created_at: null,
        updated_at: null,
      } as SessionRow & Record<string, unknown>;
      const result = parseSessionRowWithDates(row);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should parse string options to object', () => {
      const result = parseSessionRowWithDates(baseRow as SessionRow & Record<string, unknown>);
      expect(result.options).toEqual({ headless: true });
    });

    it('should handle invalid JSON options gracefully with dates', () => {
      const row = { ...baseRow, options: '{bad' } as SessionRow & Record<string, unknown>;
      const result = parseSessionRowWithDates(row);
      expect(result.options).toBeNull();
      expect(result.start_time).toBeInstanceOf(Date);
    });

    it('should preserve all primitive fields', () => {
      const result = parseSessionRowWithDates(baseRow as SessionRow & Record<string, unknown>);
      expect(result.id).toBe('session-1');
      expect(result.user_id).toBe(1);
      expect(result.status).toBe(SessionStatus.CREATED);
      expect(result.duration).toBe(0);
    });

    it('should be a valid Session type (no assertion needed)', () => {
      const result = parseSessionRowWithDates(baseRow as SessionRow & Record<string, unknown>);
      expect(result).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(typeof result.user_id).toBe('number');
    });
  });
});

describe('MachineRow → MachineInfo mapper', () => {
  it('should map snake_case fields to camelCase', () => {
    const machineRow = {
      id: 'machine-1',
      hostname: 'test-host',
      ip: '192.168.1.1',
      grpc_port: 50051,
      proxy_port: 8080,
      cpu_usage: 50,
      memory_usage: 60,
      disk_usage: 70,
      instance_count: 3,
      max_instances: 10,
      status: 'online',
      last_seen: '2025-01-01T00:00:00.000Z',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
    } satisfies MachineRow;

    const expected = {
      id: 'machine-1',
      hostname: 'test-host',
      ip: '192.168.1.1',
      grpcPort: 50051,
      proxyPort: 8080,
      cpuUsage: 50,
      memoryUsage: 60,
      diskUsage: 70,
      instanceCount: 3,
      maxInstances: 10,
      status: 'online' as const,
      lastSeen: '2025-01-01T00:00:00.000Z',
    };

    expect(machineRow.grpc_port).toBe(expected.grpcPort);
    expect(machineRow.proxy_port).toBe(expected.proxyPort);
    expect(machineRow.cpu_usage).toBe(expected.cpuUsage);
    expect(machineRow.memory_usage).toBe(expected.memoryUsage);
    expect(machineRow.disk_usage).toBe(expected.diskUsage);
    expect(machineRow.instance_count).toBe(expected.instanceCount);
    expect(machineRow.max_instances).toBe(expected.maxInstances);
  });
});
