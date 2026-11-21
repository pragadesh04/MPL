/**
 * Env parsing without `server-only`, so scripts (seed, migrate, operator tools) can use it.
 * App code imports `env()` from `./env` instead.
 */
import { z } from 'zod';

/** Dev / test fallback when no Postgres URL is configured: a local PGlite directory. */
export const DEFAULT_PGLITE_URL = 'pglite:./.pglite/dev';

const secret = (name: string) =>
  z
    .string({ error: `${name} is required (32 random bytes, base64)` })
    .min(32, `${name} must be at least 32 characters (32 random bytes, base64)`);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /**
     * App connection. Neon pooled URL in production (host contains `-pooler`). Also accepts a
     * plain Postgres URL (Docker) or `pglite:<dir>` / `pglite:memory` for local work.
     */
    DATABASE_URL: z.string().min(1).optional(),
    /** Direct (unpooled) URL, used only by migrations. */
    DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
    /** Server only. Missing → real-time disabled (events are recorded and logged instead). */
    ABLY_API_KEY: z.string().min(1).optional(),
    JWT_SECRET: secret('JWT_SECRET'),
    INVITE_LINK_SECRET: secret('INVITE_LINK_SECRET'),
    APP_ENCRYPTION_KEY: secret('APP_ENCRYPTION_KEY'),
    PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production' && !e.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL is required in production' });
    }
    if (e.NODE_ENV === 'production' && e.DATABASE_URL?.startsWith('pglite:')) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'PGlite is not allowed in production' });
    }
  })
  .transform((e) => ({
    ...e,
    DATABASE_URL: e.DATABASE_URL ?? DEFAULT_PGLITE_URL,
    DATABASE_URL_UNPOOLED: e.DATABASE_URL_UNPOOLED ?? e.DATABASE_URL ?? DEFAULT_PGLITE_URL,
  }));

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Empty strings in .env files mean "not set". */
function withoutEmpty(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== ''),
  );
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = schema.safeParse(withoutEmpty(source));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join('\n')}\nSee .env.example.`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

/** Tests only: forget the cached env after changing process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}

/**
 * Database URLs only (no secrets required) — for scripts such as migrate and seed.
 * Migrations prefer the direct URL; the app uses the pooled one.
 */
export function databaseUrls(source: NodeJS.ProcessEnv = process.env): { app: string; direct: string } {
  const e = withoutEmpty(source);
  const app = e.DATABASE_URL ?? DEFAULT_PGLITE_URL;
  return { app, direct: e.DATABASE_URL_UNPOOLED ?? app };
}
