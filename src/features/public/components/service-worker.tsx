'use client';

import { useEffect } from 'react';

/**
 * Registers the offline-shell service worker (`public/sw.js`, PLAN §7.13) in production builds
 * only, so it never interferes with dev hot reload. Renders nothing. Mounted once in the root
 * layout, so every page registers it.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Not fatal: the app works without it, just without the offline page.
    });
  }, []);
  return null;
}
