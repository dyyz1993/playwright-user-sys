import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const RAW_FOCUS_HANDLER = 'rawFocusEvent';

describe('events.handler focus listener registration', () => {
  let emitter: EventEmitter;
  let handlerFn: (...args: unknown[]) => void;

  function simulateBindLeak(emitter: EventEmitter, event: string, fn: (...args: unknown[]) => void) {
    emitter.off(event, fn.bind(null));
    emitter.on(event, fn.bind(null));
  }

  beforeEach(() => {
    emitter = new EventEmitter();
    handlerFn = vi.fn();
  });

  it('should accumulate listeners when using .bind() leak pattern', () => {
    simulateBindLeak(emitter, RAW_FOCUS_HANDLER, handlerFn);
    simulateBindLeak(emitter, RAW_FOCUS_HANDLER, handlerFn);
    simulateBindLeak(emitter, RAW_FOCUS_HANDLER, handlerFn);

    expect(emitter.listenerCount(RAW_FOCUS_HANDLER)).toBe(3);
  });

  it('should maintain exactly 1 listener when reusing same bound reference', () => {
    const bound = handlerFn.bind(null);
    emitter.off(RAW_FOCUS_HANDLER, bound);
    emitter.on(RAW_FOCUS_HANDLER, bound);
    emitter.off(RAW_FOCUS_HANDLER, bound);
    emitter.on(RAW_FOCUS_HANDLER, bound);
    emitter.off(RAW_FOCUS_HANDLER, bound);
    emitter.on(RAW_FOCUS_HANDLER, bound);

    expect(emitter.listenerCount(RAW_FOCUS_HANDLER)).toBe(1);
  });

  it('should allow cleanup via saved bound reference', () => {
    const bound = handlerFn.bind(null);
    emitter.on(RAW_FOCUS_HANDLER, bound);
    expect(emitter.listenerCount(RAW_FOCUS_HANDLER)).toBe(1);

    emitter.off(RAW_FOCUS_HANDLER, bound);
    expect(emitter.listenerCount(RAW_FOCUS_HANDLER)).toBe(0);
  });

  it('bound handler fires correctly after off+on cycle', () => {
    const bound = handlerFn.bind(null);
    emitter.on(RAW_FOCUS_HANDLER, bound);
    emitter.emit(RAW_FOCUS_HANDLER);
    expect(handlerFn).toHaveBeenCalledTimes(1);

    emitter.off(RAW_FOCUS_HANDLER, bound);
    emitter.on(RAW_FOCUS_HANDLER, bound);
    emitter.emit(RAW_FOCUS_HANDLER);
    expect(handlerFn).toHaveBeenCalledTimes(2);
  });
});
