import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'stream';

vi.mock('@shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  startHeartbeat,
  WS_HEARTBEAT_INTERVAL_MS,
  WS_HEARTBEAT_TIMEOUT_MS,
  HeartbeatSocket,
} from '../../../services/ws-heartbeat.js';

function createMockSocket() {
  const socket = new EventEmitter() as any;
  socket.destroyed = false;
  socket.writable = true;
  socket.write = vi.fn();
  socket.destroy = vi.fn();
  socket.end = vi.fn();
  socket.setKeepAlive = vi.fn();
  socket.removeListener = function (event: string, fn: (...args: any[]) => void) {
    this.off(event, fn);
  };
  return socket;
}

describe('ws-heartbeat', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let onTimeout: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSocket = createMockSocket();
    onTimeout = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('HB-01: 启动时应设置 TCP keepAlive 并启动定时器', () => {
    startHeartbeat(mockSocket, 'conn-001', onTimeout);

    expect(mockSocket.setKeepAlive).toHaveBeenCalledWith(true, WS_HEARTBEAT_INTERVAL_MS);
  });

  it('HB-02: 收到数据应重置活动时间，不触发超时', () => {
    startHeartbeat(mockSocket, 'conn-002', onTimeout);

    vi.advanceTimersByTime(WS_HEARTBEAT_INTERVAL_MS - 1);
    mockSocket.emit('data', Buffer.from('hello'));
    vi.advanceTimersByTime(WS_HEARTBEAT_INTERVAL_MS);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('HB-03: 超过超时时间无数据应触发 onTimeout', () => {
    startHeartbeat(mockSocket, 'conn-003', onTimeout);

    vi.advanceTimersByTime(WS_HEARTBEAT_TIMEOUT_MS + WS_HEARTBEAT_INTERVAL_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith('conn-003');
  });

  it('HB-04: 手动 reset 应重置活动时间', () => {
    const handle = startHeartbeat(mockSocket, 'conn-004', onTimeout);

    vi.advanceTimersByTime(WS_HEARTBEAT_INTERVAL_MS);
    handle.reset();
    vi.advanceTimersByTime(WS_HEARTBEAT_INTERVAL_MS);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('HB-05: stop 后应清理定时器且不再触发超时', () => {
    const handle = startHeartbeat(mockSocket, 'conn-005', onTimeout);

    handle.stop();
    vi.advanceTimersByTime(WS_HEARTBEAT_TIMEOUT_MS * 3);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('HB-06: socket 已 destroyed 应立即触发 onTimeout', () => {
    startHeartbeat(mockSocket, 'conn-006', onTimeout);

    mockSocket.destroyed = true;
    vi.advanceTimersByTime(WS_HEARTBEAT_INTERVAL_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('HB-07: stop 后 data 监听器应被移除', () => {
    const handle = startHeartbeat(mockSocket, 'conn-007', onTimeout);
    const listenerCountBefore = mockSocket.listenerCount('data');

    handle.stop();

    const listenerCountAfter = mockSocket.listenerCount('data');
    expect(listenerCountAfter).toBe(listenerCountBefore - 1);
  });

  it('HB-08: 多次 stop 不应报错', () => {
    const handle = startHeartbeat(mockSocket, 'conn-008', onTimeout);

    handle.stop();
    handle.stop();
    handle.stop();

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('HB-09: 自定义间隔和超时应生效', () => {
    const customInterval = 10_000;
    const customTimeout = 25_000;

    startHeartbeat(mockSocket, 'conn-009', onTimeout, customInterval, customTimeout);

    vi.advanceTimersByTime(customInterval);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(customTimeout);
    vi.advanceTimersByTime(customInterval);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('HB-10: 超时触发后不再重复触发', () => {
    startHeartbeat(mockSocket, 'conn-010', onTimeout);

    vi.advanceTimersByTime(WS_HEARTBEAT_TIMEOUT_MS + WS_HEARTBEAT_INTERVAL_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(WS_HEARTBEAT_TIMEOUT_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('HB-11: 应接受符合 HeartbeatSocket 接口的对象（无 as any）', () => {
    const typedSocket: HeartbeatSocket = {
      on: vi.fn(),
      removeListener: vi.fn(),
      setKeepAlive: vi.fn(),
      destroyed: false,
    };

    const handle = startHeartbeat(typedSocket, 'conn-011', onTimeout);

    expect(typedSocket.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(typedSocket.setKeepAlive).toHaveBeenCalledWith(true, WS_HEARTBEAT_INTERVAL_MS);

    handle.stop();
  });

  it('HB-12: destroyed 为 undefined 时不应触发 onTimeout', () => {
    const typedSocket: HeartbeatSocket = {
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    startHeartbeat(typedSocket, 'conn-012', onTimeout);

    vi.advanceTimersByTime(WS_HEARTBEAT_INTERVAL_MS);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
