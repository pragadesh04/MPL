import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * HMAC signing for GENERIC webhooks (PLAN §6.4):
 *
 *   X-MPL-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + body)>
 *
 * The timestamp is unix seconds and is also sent as `X-MPL-Timestamp`, so receivers can reject
 * replays outside a tolerance window. `verifySignature` is the reference implementation.
 */

export const SIGNATURE_PREFIX = 'sha256=';
/** Default replay window for `verifySignature`. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** A new random signing secret, shown to the organiser once. */
export function generateSigningSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

/** `sha256=<hex>` over `${timestamp}.${body}`. */
export function signPayload(secret: string, timestamp: number, body: string): string {
  const hex = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `${SIGNATURE_PREFIX}${hex}`;
}

export interface SignedHeadersInput {
  secret: string;
  event: string;
  deliveryId: number | string;
  timestamp: number;
  body: string;
}

/** The four X-MPL-* headers for one delivery. */
export function signedHeaders(input: SignedHeadersInput): Record<string, string> {
  return {
    'X-MPL-Event': input.event,
    'X-MPL-Delivery': String(input.deliveryId),
    'X-MPL-Timestamp': String(input.timestamp),
    'X-MPL-Signature': signPayload(input.secret, input.timestamp, input.body),
  };
}

export interface VerifySignatureInput {
  secret: string;
  /** Raw `X-MPL-Timestamp` header. */
  timestamp: string | number;
  /** The raw request body, exactly as received. */
  body: string;
  /** Raw `X-MPL-Signature` header. */
  signature: string;
  toleranceSeconds?: number;
  /** Current unix seconds (defaults to the system clock). */
  nowSeconds?: number;
}

/**
 * Receiver-side check: the signature matches (constant time) and the timestamp is within the
 * tolerance window. Returns false for anything malformed.
 */
export function verifySignature(input: VerifySignatureInput): boolean {
  const ts = typeof input.timestamp === 'number' ? input.timestamp : Number(input.timestamp);
  if (!Number.isInteger(ts)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - ts) > tolerance) return false;
  if (!input.signature.startsWith(SIGNATURE_PREFIX)) return false;
  const expected = Buffer.from(signPayload(input.secret, ts, input.body), 'utf8');
  const given = Buffer.from(input.signature, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
