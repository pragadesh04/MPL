import { decrypt, decryptJson, encrypt, encryptJson } from './crypto';
import { hashPassword, verifyPassword } from './password';
import { signSessionToken, verifySessionToken } from './session-token';
import { cryptoRandom, generateToken, hashToken, safeEqual } from './tokens';

const SECRET = 'a-test-secret-that-is-at-least-32-chars-long';

describe('passwords (argon2)', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('password123');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, 'password123')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('rejects short passwords and survives malformed hashes', async () => {
    expect(() => hashPassword('short')).toThrow(RangeError);
    await expect(verifyPassword('not-a-hash', 'password123')).resolves.toBe(false);
  });
});

describe('session JWT', () => {
  it('round-trips only the user id', async () => {
    const token = await signSessionToken('6f1c2b8e-1111-4222-8333-444455556666', SECRET);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe(
      '6f1c2b8e-1111-4222-8333-444455556666',
    );
  });

  it('rejects tampered, foreign-key and missing tokens', async () => {
    const token = await signSessionToken('u1', SECRET);
    await expect(verifySessionToken(`${token}x`, SECRET)).resolves.toBeNull();
    await expect(verifySessionToken(token, `${SECRET}-other`)).resolves.toBeNull();
    await expect(verifySessionToken(undefined, SECRET)).resolves.toBeNull();
  });
});

describe('AES-256-GCM', () => {
  it('round-trips and is URL-safe', () => {
    const token = encryptJson({ k: 'L', id: 'abc', tid: 'def', v: 1 }, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decryptJson(token, SECRET)).toEqual({ k: 'L', id: 'abc', tid: 'def', v: 1 });
  });

  it('returns null for tampered, invented or wrong-key tokens', () => {
    const token = encrypt('hello', SECRET);
    const flipped = token.slice(0, -2) + (token.endsWith('A') ? 'B' : 'A') + token.slice(-1);
    expect(decrypt(flipped, SECRET)).toBeNull();
    expect(decrypt('invented', SECRET)).toBeNull();
    expect(decrypt(token, `${SECRET}!`)).toBeNull();
    expect(decryptJson(encrypt('not json', SECRET), SECRET)).toBeNull();
  });
});

describe('tokens', () => {
  it('generates random tokens and stable hashes', () => {
    const a = generateToken();
    expect(a).not.toBe(generateToken());
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toHaveLength(64);
    expect(safeEqual(hashToken(a), hashToken(a))).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    const r = cryptoRandom();
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });
});
