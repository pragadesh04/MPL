import 'server-only';
import type { DnsLookup } from './ssrf';
import { createPinnedHttpsFetch, systemLookup, type WebhookFetch } from './transport';

/**
 * Everything delivery touches outside the database, swappable in tests (fake fetch / DNS, no
 * backoff delays). Production uses the defaults.
 */
export interface WebhookDeps {
  fetch: WebhookFetch;
  lookup: DnsLookup;
  /** Delay before attempt 1, 2, 3 (PLAN §6.4: up to 3 attempts with backoff). */
  retryDelaysMs: readonly number[];
  /** Per-attempt timeout. */
  timeoutMs: number;
  sleep: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

function defaults(): WebhookDeps {
  return {
    fetch: createPinnedHttpsFetch(systemLookup),
    lookup: systemLookup,
    retryDelaysMs: [0, 1_000, 3_000],
    timeoutMs: 5_000,
    sleep: realSleep,
  };
}

const g = globalThis as typeof globalThis & { __mplWebhookDeps?: WebhookDeps };

export function getWebhookDeps(): WebhookDeps {
  return (g.__mplWebhookDeps ??= defaults());
}

/** Tests: override some dependencies (merged over the defaults). */
export function setWebhookDeps(overrides: Partial<WebhookDeps>): void {
  const base = defaults();
  // A custom lookup also drives the default transport's pinned DNS.
  if (overrides.lookup && !overrides.fetch) base.fetch = createPinnedHttpsFetch(overrides.lookup);
  g.__mplWebhookDeps = { ...base, ...overrides };
}

export function resetWebhookDeps(): void {
  g.__mplWebhookDeps = undefined;
}
