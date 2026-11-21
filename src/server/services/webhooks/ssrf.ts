import 'server-only';
import { BlockList, isIP } from 'node:net';
import type { WebhookKind } from '@/lib/schemas/enums';

/**
 * SSRF guard for outgoing webhooks (PLAN §6.4, §9 item 27).
 *
 * A URL is accepted only when it is `https`, has no credentials, uses port 443, and its host
 * resolves exclusively to public addresses (no private, loopback, link-local, CGNAT, unique-local
 * IPv6, multicast, documentation or cloud-metadata ranges). Discord webhooks must also point at
 * Discord's webhook API.
 *
 * The check runs at create / update time and again before every delivery attempt; the default
 * transport (./transport.ts) also re-checks the exact address it connects to, so DNS rebinding
 * between the check and the connection can't reach an internal host.
 */

export interface ResolvedAddress {
  address: string;
  family: number;
}

/** Resolve every address of `hostname`. Injectable so tests run offline. */
export type DnsLookup = (hostname: string) => Promise<ResolvedAddress[]>;

export class UnsafeWebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeWebhookUrlError';
  }
}

const BLOCKED = new BlockList();
// IPv4
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. 169.254.169.254 metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments (incl. 192.0.0.192 Oracle metadata)
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv4');
}
// IPv6 (IPv4-mapped ::ffff:a.b.c.d is matched against the IPv4 rules by BlockList itself)
for (const [net, prefix] of [
  ['::', 96], // unspecified, loopback and deprecated IPv4-compatible
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds an arbitrary IPv4)
  ['fc00::', 7], // unique local (incl. fd00:ec2::254 AWS metadata)
  ['fe80::', 10], // link-local
  ['fec0::', 10], // deprecated site-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv6');
}

/** Hostnames that are internal by definition, rejected before any DNS lookup. */
const BLOCKED_HOST_SUFFIXES = ['localhost', '.local', '.internal', '.localdomain', '.home.arpa'];

/** Expand an IPv6 address to 8 numeric hextets (handles `::` and a trailing dotted IPv4). */
function ipv6Hextets(address: string): number[] | null {
  let addr = address.toLowerCase().split('%')[0] ?? '';
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (dotted?.[1]) {
    const parts = dotted[1].split('.').map(Number);
    const [a = 0, b = 0, c = 0, d = 0] = parts;
    addr =
      addr.slice(0, addr.length - dotted[1].length) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = addr.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const missing = 8 - h.length - t.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return null;
  const all = [...h, ...Array<string>(missing).fill('0'), ...t].map((x) => parseInt(x, 16));
  return all.length === 8 && all.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff)
    ? all
    : null;
}

/** True when `address` (IPv4 or IPv6 literal) is not a public unicast address. */
export function isBlockedAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '');
  const family = isIP(bare);
  if (family === 4) return BLOCKED.check(bare, 'ipv4');
  if (family !== 6) return true; // not an IP at all: refuse
  if (BLOCKED.check(bare, 'ipv6')) return true;
  const hx = ipv6Hextets(bare);
  if (!hx) return true;
  // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address in the last 32 bits.
  if (hx[0] === 0x64 && hx[1] === 0xff9b && hx.slice(2, 6).every((n) => n === 0)) {
    const v4 = `${hx[6]! >> 8}.${hx[6]! & 0xff}.${hx[7]! >> 8}.${hx[7]! & 0xff}`;
    return BLOCKED.check(v4, 'ipv4');
  }
  // IPv4-mapped (::ffff:0:0/96), in case BlockList didn't normalise it.
  if (hx.slice(0, 5).every((n) => n === 0) && hx[5] === 0xffff) {
    const v4 = `${hx[6]! >> 8}.${hx[6]! & 0xff}.${hx[7]! >> 8}.${hx[7]! & 0xff}`;
    return BLOCKED.check(v4, 'ipv4');
  }
  return false;
}

const DISCORD_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
]);
const DISCORD_PATH = /^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/;

/**
 * Structural checks only (no DNS): scheme, credentials, port, internal hostnames, IP literals and
 * the Discord URL shape. Returns the parsed URL. Throws `UnsafeWebhookUrlError`.
 */
export function parseWebhookUrl(raw: string, kind: WebhookKind): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeWebhookUrlError('That isn’t a valid URL');
  }
  if (url.protocol !== 'https:')
    throw new UnsafeWebhookUrlError('The URL must start with https://');
  if (url.username || url.password)
    throw new UnsafeWebhookUrlError('The URL must not contain a username or password');
  // The WHATWG parser drops the default port, so anything left is a non-443 port.
  if (url.port !== '' && url.port !== '443')
    throw new UnsafeWebhookUrlError('Only the standard https port (443) is allowed');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new UnsafeWebhookUrlError('The URL needs a host name');
  if (BLOCKED_HOST_SUFFIXES.some((s) => host === s.replace(/^\./, '') || host.endsWith(s)))
    throw new UnsafeWebhookUrlError('Private or internal hosts are not allowed');
  const literal = host.replace(/^\[|\]$/g, '');
  if (isIP(literal) && isBlockedAddress(literal))
    throw new UnsafeWebhookUrlError('Private or internal addresses are not allowed');
  if (kind === 'DISCORD' && (!DISCORD_HOSTS.has(host) || !DISCORD_PATH.test(url.pathname)))
    throw new UnsafeWebhookUrlError(
      'Paste a Discord channel webhook URL (https://discord.com/api/webhooks/…)',
    );
  return url;
}

/**
 * Full check: structure plus DNS. Every resolved address must be public. Returns the vetted
 * addresses (the transport connects to one of these).
 */
export async function assertSafeWebhookUrl(
  raw: string,
  kind: WebhookKind,
  lookup: DnsLookup,
): Promise<{ url: URL; addresses: ResolvedAddress[] }> {
  const url = parseWebhookUrl(raw, kind);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return { url, addresses: [{ address: host, family: isIP(host) }] };
  const addresses = await resolveSafe(host, lookup);
  return { url, addresses };
}

/** Resolve `hostname` and refuse if it has no address or any address is non-public. */
export async function resolveSafe(hostname: string, lookup: DnsLookup): Promise<ResolvedAddress[]> {
  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new UnsafeWebhookUrlError(`Couldn’t resolve ${hostname}`);
  }
  if (addresses.length === 0) throw new UnsafeWebhookUrlError(`Couldn’t resolve ${hostname}`);
  if (addresses.some((a) => isBlockedAddress(a.address)))
    throw new UnsafeWebhookUrlError(`${hostname} resolves to a private or internal address`);
  return addresses;
}

/** Shown in lists instead of the URL: host plus the last 4 characters. */
export function maskWebhookUrl(raw: string): string {
  let host = '';
  try {
    host = new URL(raw).host;
  } catch {
    host = 'invalid-url';
  }
  return `${host}/…${raw.slice(-4)}`;
}
