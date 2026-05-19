import { WebSocket } from 'ws';
import { SessionConfig } from '../browser.service.js';
import { Page, Frame } from 'puppeteer-core';

type KeyInput = Parameters<Page['keyboard']['press']>[0];

export { type KeyInput };

export const NAVIGATION_TIMEOUT = 15_000;
export const PAGE_LOAD_TIMEOUT = 30_000;

declare global {
  interface Window {
    _mouseTrackingInjected?: boolean;
    updateMousePosition?: (_x: number, _y: number, _viewportWidth: number, _viewportHeight: number) => void;
    _focusListenerAttached?: boolean;
    _emitFocusEvent?: () => void;
    __fileInputClickEvent?: { timestamp: number; accept: string | null; multiple: boolean } | null | undefined;
    __clipboardContent?: string;
  }
}

export interface EventConnectionInfo {
  page: Page;
  sessionId: string;
  config: SessionConfig;
  listeners: {
    pageCloseHandler?: () => void;
    pageCrashHandler?: () => void;
    frameNavigatedHandler?: (_frame: Frame) => void;
    configUpdateListener?: (_sessionId: string, _newConfig: SessionConfig) => void;
    rawFocusHandler?: () => void;
    focusListenerAttached?: boolean;
  };
  _clipboardPollInterval?: NodeJS.Timeout;
}

export interface FileUploadStartData {
  filename: string;
  totalChunks: number;
  size: number;
}

export interface FileUploadChunkData {
  filepath: string;
  chunkIndex: number;
  data: string;
  chunk: string;
  isLast?: boolean;
}

export interface MouseEventData {
  selector?: string;
  frameSelector?: string;
  value?: string;
  replace?: boolean;
  deltaX?: number;
  deltaY?: number;
  tx?: number;
  ty?: number;
  x?: number;
  y?: number;
  button?: string;
  key?: string;
  code?: string;
  type?: string;
  clickCount?: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export const activeEventConnections = new Map<WebSocket, EventConnectionInfo>();
