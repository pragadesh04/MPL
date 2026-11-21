import 'server-only';
import pino from 'pino';

const g = globalThis as typeof globalThis & { __mplLogger?: pino.Logger };

/** Structured server logger (pino). Level from LOG_LEVEL (default info; silent in tests). */
export const logger: pino.Logger =
  g.__mplLogger ??
  (g.__mplLogger = pino({
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    base: undefined,
  }));
