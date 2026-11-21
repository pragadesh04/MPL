import { AppError } from './errors';
import { checkRateLimit, enforceRateLimit } from './rate-limit';
import { setupTestDb } from '@/test/db';

setupTestDb();

describe('Postgres rate limiting', () => {
  it('counts within the window and blocks over the limit', async () => {
    const key = 'login:ip:1.2.3.4';
    expect((await checkRateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await checkRateLimit(key, 2, 60)).allowed).toBe(true);
    const third = await checkRateLimit(key, 2, 60);
    expect(third).toMatchObject({ allowed: false, count: 3, limit: 2 });
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
    expect(third.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('keeps keys independent and throws 429 from enforceRateLimit', async () => {
    await enforceRateLimit('lookup:user:a', 1, 60);
    await enforceRateLimit('lookup:user:b', 1, 60);
    await expect(enforceRateLimit('lookup:user:a', 1, 60)).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.status === 429,
    );
  });
});
