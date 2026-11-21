/**
 * Database connection factory, shared by the app (`client.ts`), scripts and tests.
 * No `server-only` here so scripts can import it; never import it from client code.
 *
 * URL forms:
 * - Neon (`*.neon.tech`): Pool over WebSocket (transactions) + HTTP driver (one-shot reads)
 * - any other `postgres://` URL (Docker, local Postgres): node-postgres Pool
 * - `pglite:<dir>` / `pglite:memory`: in-process PGlite (dev without credentials, tests).
 *   PGlite is a single connection: don't run the seed while `next dev` holds the same dir,
 *   and never use it for concurrency tests.
 */
import { PGlite } from '@electric-sql/pglite';
import { neon, neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNeonWs } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { Pool as PgPool } from 'pg';
import ws from 'ws';
import * as schema from './schema';

export type Schema = typeof schema;
/** Any Drizzle database or transaction over our schema. Services accept this. */
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** An open transaction (from `withTransaction` / `db.transaction`). */
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type DriverKind = 'neon' | 'postgres' | 'pglite';

export interface Connection {
  kind: DriverKind;
  /** Supports interactive transactions. */
  db: Db;
  /** One-shot reads (Neon HTTP driver when available; otherwise the same as `db`). */
  readDb: Db;
  close: () => Promise<void>;
  /** Present for PGlite connections (used by the migrator and tests). */
  pglite?: PGlite;
}

export function driverKind(url: string): DriverKind {
  if (url.startsWith('pglite:')) return 'pglite';
  try {
    return new URL(url).hostname.endsWith('.neon.tech') ? 'neon' : 'postgres';
  } catch {
    return 'postgres';
  }
}

export function pgliteLocation(url: string): string | undefined {
  const where = url.slice('pglite:'.length);
  return where === '' || where === 'memory' ? undefined : where;
}

export function connect(url: string, opts: { maxConnections?: number } = {}): Connection {
  const kind = driverKind(url);

  if (kind === 'pglite') {
    const client = new PGlite(pgliteLocation(url));
    const db = drizzlePglite({ client, schema }) as unknown as Db;
    return { kind, db, readDb: db, pglite: client, close: () => client.close() };
  }

  if (kind === 'neon') {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: url, max: opts.maxConnections ?? 5 });
    const db = drizzleNeonWs({ client: pool, schema }) as unknown as Db;
    const readDb = drizzleNeonHttp({ client: neon(url), schema }) as unknown as Db;
    return { kind, db, readDb, close: () => pool.end() };
  }

  const pool = new PgPool({ connectionString: url, max: opts.maxConnections ?? 10 });
  const db = drizzleNodePg({ client: pool, schema }) as unknown as Db;
  return { kind, db, readDb: db, close: () => pool.end() };
}
