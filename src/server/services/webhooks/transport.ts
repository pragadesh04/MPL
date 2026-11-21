import 'server-only';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';
import { resolveSafe, type DnsLookup } from './ssrf';

/**
 * The HTTP call a delivery makes. Shaped like `fetch` (the global `fetch` satisfies it), so tests
 * inject a fake and never touch the network.
 */
export interface WebhookRequestInit {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
  redirect: 'manual';
}

export type WebhookFetch = (
  url: string,
  init: WebhookRequestInit,
) => Promise<{ status: number; ok?: boolean }>;

/** System DNS: every address of `hostname`. */
export const systemLookup: DnsLookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => ({
    address: a.address,
    family: a.family,
  }));

/**
 * Default transport: node:https with a `lookup` hook that resolves the host itself and refuses
 * any non-public address, so the socket can only ever connect to an address that passed the SSRF
 * guard (no DNS-rebinding window between the check and the connect). Redirects are not followed;
 * a 3xx counts as a failure.
 */
export function createPinnedHttpsFetch(lookup: DnsLookup = systemLookup): WebhookFetch {
  const pinnedLookup: LookupFunction = (hostname, options, callback) => {
    resolveSafe(hostname, lookup).then(
      (addresses) => {
        const wanted = options.family === 4 || options.family === 6 ? options.family : 0;
        const usable = wanted ? addresses.filter((a) => a.family === wanted) : addresses;
        if (usable.length === 0) {
          callback(new Error(`No usable address for ${hostname}`), '', 0);
          return;
        }
        if (options.all) callback(null, usable);
        else callback(null, usable[0]!.address, usable[0]!.family);
      },
      (err: unknown) => callback(err instanceof Error ? err : new Error(String(err)), '', 0),
    );
  };

  return (url, init) =>
    new Promise((resolve, reject) => {
      const req = request(
        url,
        { method: init.method, headers: init.headers, signal: init.signal, lookup: pinnedLookup },
        (res) => {
          const status = res.statusCode ?? 0;
          res.resume(); // drain and discard the body
          resolve({ status, ok: status >= 200 && status < 300 });
        },
      );
      req.on('error', reject);
      req.end(init.body);
    });
}
