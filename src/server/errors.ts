import { ERROR_STATUS, type ApiError, type ErrorCode } from '@/lib/schemas/api';

/**
 * Typed application errors. Services throw these; `src/server/http.ts` turns them into the
 * `{ error: { code, message, details } }` envelope (src/lib/schemas/api.ts).
 *
 * Tenant rule (PLAN §2.0, §5): anything the caller may not know exists — another organiser's
 * tournament, an invalid token or code — is a plain `notFound()` with the generic message.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }

  toJSON(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const GENERIC_NOT_FOUND = 'Not found';

export const notFound = (message = GENERIC_NOT_FOUND): AppError =>
  new AppError('NOT_FOUND', message);
export const unauthenticated = (message = 'Please log in'): AppError =>
  new AppError('UNAUTHENTICATED', message);
export const forbidden = (message = 'You can’t do that in this tournament'): AppError =>
  new AppError('FORBIDDEN', message);
export const conflict = (message: string, details?: Record<string, unknown>): AppError =>
  new AppError('CONFLICT', message, details);
export const badRequest = (message: string, details?: Record<string, unknown>): AppError =>
  new AppError('BAD_REQUEST', message, details);
/** A pure rule refused the action; `reason` is the rule's machine-readable reason code. */
export const ruleViolation = (reason: string, message: string): AppError =>
  new AppError('RULE_VIOLATION', message, { reason });
export const rateLimited = (retryAfterSeconds: number): AppError =>
  new AppError('RATE_LIMITED', 'Too many requests, slow down', { retryAfterSeconds });
export const notImplemented = (what: string): AppError =>
  new AppError('NOT_IMPLEMENTED', `${what} is not implemented yet`);

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
  constraint_name?: string;
  cause?: unknown;
}

/** Walk `err` and its `cause` chain (Drizzle wraps driver errors) for a Postgres error. */
function findPgError(err: unknown, depth = 0): PgErrorLike | undefined {
  if (!err || typeof err !== 'object' || depth > 5) return undefined;
  const e = err as PgErrorLike;
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e;
  return findPgError(e.cause, depth + 1);
}

/** Postgres SQLSTATE of `err` (or its cause), e.g. '23505'. */
export function pgErrorCode(err: unknown): string | undefined {
  return findPgError(err)?.code;
}

/** Name of the violated constraint / index, when the driver reports it. */
export function pgConstraint(err: unknown): string | undefined {
  const e = findPgError(err);
  return e?.constraint ?? e?.constraint_name;
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (pgErrorCode(err) !== '23505') return false;
  if (!constraint) return true;
  const name = pgConstraint(err);
  // Some drivers omit the name; fall back to the message text.
  return name
    ? name === constraint
    : String(err).includes(constraint) || String(findPgError(err)).includes(constraint);
}

export function isCheckViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23514';
}

/**
 * Run a write and turn a unique violation into a 409 with `message` (CLAUDE.md: let the database
 * decide races, don't pre-check). Pass `constraint` to only map that one index.
 *
 *   await mapUniqueViolation(() => tx.insert(tournaments).values(v), 'You already have an active tournament',
 *     'tournaments_one_active_per_owner_uq');
 */
export async function mapUniqueViolation<T>(
  fn: () => Promise<T>,
  message: string,
  constraint?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err, constraint)) throw conflict(message);
    throw err;
  }
}
