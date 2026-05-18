import pino from 'pino';

const SENSITIVE_FIELDS = ['apikey', 'password', 'token', 'secret', 'authorization'];

export function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Error) return value;
  if (Array.isArray(value)) return value.map(sanitize);

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitize(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export interface LoggerConfig {
  level: string;
  transport?: { target: string; options: Record<string, unknown> };
  serializers?: pino.LoggerOptions['serializers'];
}

export function createLoggerConfig(): LoggerConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const level = process.env.LOG_LEVEL || 'info';

  const config: LoggerConfig = {
    level,
    serializers: {
      err: pino.stdSerializers.err,
      req: (req: Record<string, unknown>) => ({
        method: req.method,
        url: req.url,
      }),
      res: (res: Record<string, unknown>) => ({
        statusCode: res.statusCode,
      }),
    },
  };

  if (!isProduction && !isTest) {
    config.transport = {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  }

  return config;
}

export function createFastifyLoggerConfig(): LoggerConfig | false {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return createLoggerConfig();
}
