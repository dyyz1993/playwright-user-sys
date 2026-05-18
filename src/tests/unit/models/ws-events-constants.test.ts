import { describe, it, expect } from 'vitest';
import {
  WS_EVENT_SESSION_ENDED,
  WS_EVENT_SESSION_CREATED,
} from '../../../machine/session_handlers/ws-events.constants.js';

describe('WS Events Constants', () => {
  it('WS-CONST-01: WS_EVENT_SESSION_ENDED should be session_ended', () => {
    expect(WS_EVENT_SESSION_ENDED).toBe('session_ended');
  });

  it('WS-CONST-02: WS_EVENT_SESSION_CREATED should be session_created', () => {
    expect(WS_EVENT_SESSION_CREATED).toBe('session_created');
  });

  it('WS-CONST-03: constants should be string type', () => {
    expect(typeof WS_EVENT_SESSION_ENDED).toBe('string');
    expect(typeof WS_EVENT_SESSION_CREATED).toBe('string');
  });
});
