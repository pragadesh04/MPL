import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Race / concurrency tests (Lane B, PLAN §13.5 B9). They need REAL Postgres — a throwaway Neon
 * branch or local Docker — because PGlite is a single connection.
 * Set CONCURRENCY_DATABASE_URL (direct URL) before running `npm run test:concurrency`.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': fileURLToPath(new URL('./src/test/empty-module.ts', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/concurrency/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test' as const,
      JWT_SECRET: 'test-jwt-secret-test-jwt-secret-0123456789',
      INVITE_LINK_SECRET: 'test-invite-secret-test-invite-secret-0123',
      APP_ENCRYPTION_KEY: 'test-encryption-key-test-encryption-key-01',
      PUBLIC_APP_URL: 'http://localhost:3000',
      DATABASE_URL: process.env.CONCURRENCY_DATABASE_URL ?? '',
      LOG_LEVEL: 'silent',
    },
  },
});
