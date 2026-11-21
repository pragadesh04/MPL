import 'server-only';
import { NextResponse } from 'next/server';
import { z, type ZodType } from 'zod';
import { NotImplementedError } from '@/lib/rules/not-implemented';
import type { ActionResult, ApiError } from '@/lib/schemas/api';
import { AppError, badRequest } from './errors';
import { logger } from './logger';

/**
 * Route Handler / Server Action plumbing. Handlers stay thin: parse input, call a service, return
 * JSON. All logic and authorisation live in `src/server/services` (CLAUDE.md).
 *
 *   export const POST = handle(async (req, { params }) => {
 *     const { id } = await params;
 *     const body = await parseJson(req, placeBidRequestSchema);
 *     return json(await placeBid(await getSessionUserId(), id, body));
 *   });
 */

type RouteContext<P> = { params: Promise<P> };

export function handle<P = Record<string, string>>(
  fn: (req: Request, ctx: RouteContext<P>) => Promise<Response>,
): (req: Request, ctx: RouteContext<P>) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

/** Map any thrown value to the API error envelope. Unknown errors are logged and hidden. */
export function toApiError(err: unknown): { status: number; body: ApiError } {
  if (err instanceof AppError) return { status: err.status, body: err.toJSON() };
  if (err instanceof z.ZodError) {
    return {
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Some fields are invalid',
          details: { issues: z.flattenError(err).fieldErrors },
        },
      },
    };
  }
  if (err instanceof NotImplementedError) {
    return { status: 501, body: { error: { code: 'NOT_IMPLEMENTED', message: err.message } } };
  }
  logger.error({ err }, 'unhandled error');
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong' } } };
}

export function errorResponse(err: unknown): NextResponse<ApiError> {
  const { status, body } = toApiError(err);
  const headers: Record<string, string> = {};
  const retry = err instanceof AppError ? err.details?.retryAfterSeconds : undefined;
  if (typeof retry === 'number') headers['Retry-After'] = String(retry);
  return NextResponse.json(body, { status, headers });
}

/** Parse and validate a JSON body (throws 400 on bad JSON, 422 on schema errors). */
export async function parseJson<S extends ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text.length === 0 ? {} : (JSON.parse(text) as unknown);
  } catch {
    throw badRequest('Body must be valid JSON');
  }
  return schema.parse(raw);
}

/** Parse query-string parameters with a Zod object schema. */
export function parseQuery<S extends ZodType>(req: Request, schema: S): z.infer<S> {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}

/** Best-effort client IP for rate-limit keys (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

/** Wrap a Server Action body: returns `{ ok, data }` or `{ ok: false, error, fieldErrors }`. */
export async function action<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const { body } = toApiError(err);
    const fieldErrors =
      err instanceof z.ZodError
        ? (z.flattenError(err).fieldErrors as Record<string, string[]>)
        : undefined;
    return { ok: false, error: body.error, ...(fieldErrors ? { fieldErrors } : {}) };
  }
}
