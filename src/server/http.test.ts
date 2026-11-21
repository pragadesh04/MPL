import { z } from 'zod';
import { NotImplementedError } from '@/lib/rules/not-implemented';
import { conflict, isUniqueViolation, mapUniqueViolation, notFound, rateLimited } from './errors';
import { action, handle, parseJson, toApiError } from './http';
import { readEnv } from './env-core';

describe('error envelope', () => {
  it('maps app, validation, not-implemented and unknown errors', () => {
    expect(toApiError(notFound())).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Not found' } },
    });
    expect(toApiError(conflict('taken')).status).toBe(409);
    expect(toApiError(z.object({ a: z.string() }).safeParse({}).error).status).toBe(422);
    expect(toApiError(new NotImplementedError('x', 'Lane B')).status).toBe(501);
    expect(toApiError(new Error('boom'))).toMatchObject({
      status: 500,
      body: { error: { code: 'INTERNAL' } },
    });
  });

  it('handle() turns throws into JSON responses with Retry-After', async () => {
    const route = handle(async () => {
      throw rateLimited(30);
    });
    const res = await route(new Request('http://x/api'), { params: Promise.resolve({}) });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(await res.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('parseJson validates bodies', async () => {
    const schema = z.object({ n: z.number() });
    await expect(
      parseJson(new Request('http://x', { method: 'POST', body: '{"n":1}' }), schema),
    ).resolves.toEqual({ n: 1 });
    await expect(
      parseJson(new Request('http://x', { method: 'POST', body: '{' }), schema),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('action() returns a result object', async () => {
    await expect(action(async () => 5)).resolves.toEqual({ ok: true, data: 5 });
    const failed = await action(async () => z.object({ a: z.string() }).parse({}));
    expect(failed.ok).toBe(false);
  });

  it('maps unique violations to 409', async () => {
    const pgErr = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'users_username_lower_uq',
    });
    const wrapped = Object.assign(new Error('Failed query'), { cause: pgErr });
    expect(isUniqueViolation(wrapped)).toBe(true);
    expect(isUniqueViolation(wrapped, 'users_username_lower_uq')).toBe(true);
    expect(isUniqueViolation(wrapped, 'other')).toBe(false);
    await expect(
      mapUniqueViolation(() => Promise.reject(wrapped), 'Username taken'),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Username taken',
    });
  });
});

describe('env', () => {
  it('treats empty values as unset and falls back to PGlite', () => {
    const e = readEnv({
      NODE_ENV: 'development',
      DATABASE_URL: '',
      JWT_SECRET: 'x'.repeat(32),
      INVITE_LINK_SECRET: 'y'.repeat(32),
      APP_ENCRYPTION_KEY: 'z'.repeat(32),
    });
    expect(e.DATABASE_URL).toBe('pglite:./.pglite/dev');
    expect(e.ABLY_API_KEY).toBeUndefined();
  });

  it('requires secrets and a real database in production', () => {
    expect(() => readEnv({ NODE_ENV: 'development' })).toThrow(/JWT_SECRET/);
    expect(() =>
      readEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(32),
        INVITE_LINK_SECRET: 'y'.repeat(32),
        APP_ENCRYPTION_KEY: 'z'.repeat(32),
      }),
    ).toThrow(/DATABASE_URL/);
  });
});
