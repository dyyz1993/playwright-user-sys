export type DbDriver = 'better-sqlite3' | 'node-sqlite';

export function getSqliteClient(): string {
  const driver = (process.env.DB_DRIVER as DbDriver) || 'better-sqlite3';

  switch (driver) {
    case 'better-sqlite3':
      return 'better-sqlite3';
    case 'node-sqlite':
      console.warn('[DB] node:sqlite driver not yet supported, falling back to better-sqlite3');
      return 'better-sqlite3';
    default:
      return 'better-sqlite3';
  }
}

export async function checkNodeSqliteAvailability(): Promise<boolean> {
  try {
    await import('node:sqlite');
    return true;
  } catch {
    return false;
  }
}
