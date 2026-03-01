/**
 * Storage configuration constants
 */
export const STORAGE_CONFIG = {
  /** Maximum size per session (500MB) */
  MAX_SESSION_SIZE: 500 * 1024 * 1024,
  /** Maximum shared storage size per user (2GB) */
  MAX_SHARED_SIZE_PER_USER: 2 * 1024 * 1024 * 1024,
  /** Maximum total storage size per user (5GB) */
  MAX_TOTAL_SIZE_PER_USER: 5 * 1024 * 1024 * 1024,
  /** Cleanup shared data older than this many days */
  SHARED_CLEANUP_AGE_DAYS: 30,
} as const;
