import 'server-only';
import { notFound } from './errors';

/**
 * Dev-only tooling guard. `/dev/*` routes, `/api/dev/*` and the seed script must not exist in
 * production (PLAN §13.3, §13.8 I4). Every dev route calls this first.
 */
export function isDevToolsEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function assertDevTools(): void {
  if (!isDevToolsEnabled()) throw notFound();
}
