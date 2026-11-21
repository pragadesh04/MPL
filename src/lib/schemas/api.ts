import { z } from 'zod';

/**
 * Error envelope for every Route Handler and Server Action (`src/server/errors.ts` builds it).
 * Invalid tokens / codes and "no role in this tournament" all answer the same generic 404.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  /** Auction: expectedVersion is stale (somebody else bid first). */
  'OUTBID',
  /** Auction: the lot already closed by Postgres now(). */
  'TOO_LATE',
  /** A rule refused the action; `details.reason` holds the rule's reason code. */
  'RULE_VIOLATION',
  'RATE_LIMITED',
  'NOT_IMPLEMENTED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUTBID: 409,
  TOO_LATE: 409,
  RULE_VIOLATION: 409,
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Server Action result shape (forms). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError['error']; fieldErrors?: Record<string, string[]> };
