import 'server-only';
import { readEnv, type Env } from './env-core';

/**
 * Validated server environment. Lazy so `next build` can import route modules without a
 * full env; the first real request validates and caches it.
 */
export function env(): Env {
  return readEnv();
}

export type { Env };
