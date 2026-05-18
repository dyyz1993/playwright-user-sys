import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { safeSend, safeSendWithCallback, MAX_WS_BUFFER_SIZE } from '../../../utils/ws-backpressure.js';

const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

function createMockWebSocket(overrides: Partial<{ readyState: number; bufferedAmount: number }> = {}) {
  return {
    readyState: overrides.readyState ?? OPEN,
    bufferedAmount: overrides.bufferedAmount ?? 0,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe('ws-backpressure', () => {
  describe('safeSend', () => {
    it('BP-01: readyState=OPEN 且缓冲区空闲时应成功发送', () => {
      const ws = createMockWebSocket({ readyState: OPEN, bufferedAmount: 0 });

      const result = safeSend(ws, Buffer.from('frame-data'));

      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(ws.send).toHaveBeenCalledWith(Buffer.from('frame-data'), {});
    });

    it('BP-02: readyState=CLOSING 应跳过发送并返回 false', () => {
      const ws = createMockWebSocket({ readyState: CLOSING, bufferedAmount: 0 });

      const result = safeSend(ws, 'data');

      expect(result).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('BP-03: readyState=CLOSED 应跳过发送并返回 false', () => {
      const ws = createMockWebSocket({ readyState: CLOSED, bufferedAmount: 0 });

      const result = safeSend(ws, 'data');

      expect(result).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('BP-04: bufferedAmount 超过 MAX_WS_BUFFER_SIZE 应跳过发送', () => {
      const ws = createMockWebSocket({ readyState: OPEN, bufferedAmount: MAX_WS_BUFFER_SIZE + 1 });

      const result = safeSend(ws, Buffer.from('frame'));

      expect(result).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('BP-05: bufferedAmount 等于 MAX_WS_BUFFER_SIZE 应跳过发送', () => {
      const ws = createMockWebSocket({ readyState: OPEN, bufferedAmount: MAX_WS_BUFFER_SIZE });

      const result = safeSend(ws, Buffer.from('frame'));

      expect(result).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('BP-06: bufferedAmount 小于 MAX_WS_BUFFER_SIZE 应成功发送', () => {
      const ws = createMockWebSocket({ readyState: OPEN, bufferedAmount: MAX_WS_BUFFER_SIZE - 1 });

      const result = safeSend(ws, Buffer.from('frame'));

      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('BP-07: 应支持传入 binary 选项', () => {
      const ws = createMockWebSocket({ readyState: OPEN, bufferedAmount: 0 });

      const result = safeSend(ws, Buffer.from('binary-data'), { binary: true });

      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledWith(Buffer.from('binary-data'), { binary: true });
    });

    it('BP-08: 字符串数据也应正确发送', () => {
      const ws = createMockWebSocket({ readyState: OPEN, bufferedAmount: 0 });

      const result = safeSend(ws, '{"type":"session_ended"}');

      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledWith('{"type":"session_ended"}', {});
    });
  });

  describe('safeSendWithCallback', () => {
    it('BP-09: 成功发送时应调用 callback', () => {
      const ws = createMockWebSocket({ readyState: OPEN, bufferedAmount: 0 });
      const callback = vi.fn();

      ws.send = vi.fn((_data: unknown, _opts: unknown, cb: (err?: Error) => void) => cb());

      const result = safeSendWithCallback(ws, Buffer.from('data'), { binary: true }, callback);

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalled();
    });

    it('BP-10: 缓冲区满时应跳过且不调用 callback', () => {
      const ws = createMockWebSocket({ readyState: OPEN, bufferedAmount: MAX_WS_BUFFER_SIZE + 1 });
      const callback = vi.fn();

      const result = safeSendWithCallback(ws, Buffer.from('data'), { binary: true }, callback);

      expect(result).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('BP-11: readyState 非 OPEN 时应跳过', () => {
      const ws = createMockWebSocket({ readyState: CLOSED, bufferedAmount: 0 });
      const callback = vi.fn();

      const result = safeSendWithCallback(ws, Buffer.from('data'), { binary: true }, callback);

      expect(result).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('MAX_WS_BUFFER_SIZE', () => {
    it('BP-12: 应为 1MB', () => {
      expect(MAX_WS_BUFFER_SIZE).toBe(1024 * 1024);
    });
  });
});
