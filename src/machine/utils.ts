// src/machine/session_handlers/events.handler.ts (或者移到更公共的位置如 src/utils)
import { EventEmitter } from 'events';
// 这个 emitter 需要被 browser.service.ts 和 events.handler.ts 都能访问
export const sessionFocusEmitter = new EventEmitter();