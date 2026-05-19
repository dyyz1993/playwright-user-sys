import type { SessionConfig } from './types.js';

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  fps: 15,
  interactionMode: 'general_navigation',
  touchMode: 'touchpad',
};

export const CHROMIUM_LOCK_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile'];

export const CHROMIUM_LOCK_SUBDIRS = ['', 'Default', 'System Profile', 'Service State'];
