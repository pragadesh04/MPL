import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: almost every page reads the session cookie or the
  // database at request time, and the auction is fully live. Classic dynamic rendering keeps
  // the lanes from fighting "uncached data outside <Suspense>" build errors. See CLAUDE.md.
  cacheComponents: false,
  // Native / WASM packages must not be bundled.
  serverExternalPackages: ['@node-rs/argon2', '@electric-sql/pglite', 'pino', 'ws'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
