import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Two projects (both inherit the root plugins / resolve / env):
 * - `node`: rules, schemas, server code and services (PGlite via src/test/db.ts) — *.test.ts
 * - `dom`: React components with Testing Library (jsdom) — *.test.tsx
 * Concurrency tests against real Postgres live in tests/concurrency and use
 * vitest.concurrency.config.mts (`npm run test:concurrency`).
 */
export const testEnv = {
  NODE_ENV: 'test' as const,
  JWT_SECRET: 'test-jwt-secret-test-jwt-secret-0123456789',
  INVITE_LINK_SECRET: 'test-invite-secret-test-invite-secret-0123',
  APP_ENCRYPTION_KEY: 'test-encryption-key-test-encryption-key-01',
  PUBLIC_APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'pglite:memory',
  LOG_LEVEL: 'silent',
};

export const serverOnlyAlias = {
  // `server-only` throws outside the react-server condition; tests import server modules.
  'server-only': fileURLToPath(new URL('./src/test/empty-module.ts', import.meta.url)),
};

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true, alias: serverOnlyAlias },
  test: {
    globals: true,
    env: testEnv,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/app/**', 'src/components/ui/**'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup-dom.ts'],
        },
      },
    ],
  },
});
