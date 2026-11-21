import { createHmac } from 'node:crypto';
import { generateSigningSecret, signedHeaders, signPayload, verifySignature } from './signing';

describe('webhook signing (PLAN §6.4)', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({ id: 'evt_1', event: 'lot.sold', data: { price: 12 } });
  const ts = 1_800_000_000;

  it('signs HMAC-SHA256(secret, timestamp + "." + body) as sha256=<hex>', () => {
    const expected = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    expect(signPayload(secret, ts, body)).toBe(`sha256=${expected}`);
  });

  it('builds the four X-MPL-* headers', () => {
    const h = signedHeaders({ secret, event: 'lot.sold', deliveryId: 42, timestamp: ts, body });
    expect(h).toEqual({
      'X-MPL-Event': 'lot.sold',
      'X-MPL-Delivery': '42',
      'X-MPL-Timestamp': String(ts),
      'X-MPL-Signature': signPayload(secret, ts, body),
    });
  });

  it('round-trips through verifySignature', () => {
    const h = signedHeaders({ secret, event: 'lot.sold', deliveryId: 1, timestamp: ts, body });
    expect(
      verifySignature({
        secret,
        timestamp: h['X-MPL-Timestamp']!,
        body,
        signature: h['X-MPL-Signature']!,
        nowSeconds: ts + 10,
      }),
    ).toBe(true);
  });

  it('rejects a tampered body, wrong secret, bad prefix or garbage', () => {
    const sig = signPayload(secret, ts, body);
    const base = { secret, timestamp: ts, body, signature: sig, nowSeconds: ts };
    expect(verifySignature({ ...base, body: body.replace('12', '13') })).toBe(false);
    expect(verifySignature({ ...base, secret: 'other' })).toBe(false);
    expect(verifySignature({ ...base, signature: sig.replace('sha256=', 'sha1=') })).toBe(false);
    expect(verifySignature({ ...base, signature: 'sha256=abc' })).toBe(false);
    expect(verifySignature({ ...base, timestamp: 'soon' })).toBe(false);
  });

  it('rejects replays outside the tolerance window', () => {
    const sig = signPayload(secret, ts, body);
    const base = { secret, timestamp: ts, body, signature: sig };
    expect(verifySignature({ ...base, nowSeconds: ts + 301 })).toBe(false);
    expect(verifySignature({ ...base, nowSeconds: ts - 301 })).toBe(false);
    expect(verifySignature({ ...base, nowSeconds: ts + 3600, toleranceSeconds: 7200 })).toBe(true);
  });

  it('generates distinct, long secrets', () => {
    const a = generateSigningSecret();
    const b = generateSigningSecret();
    expect(a).toMatch(/^whsec_[\w-]{40,}$/);
    expect(a).not.toBe(b);
  });
});
