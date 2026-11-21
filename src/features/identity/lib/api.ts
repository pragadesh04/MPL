import { apiErrorSchema } from '@/lib/schemas/api';

/**
 * Tiny fetch wrapper for Lane A client components. Every action is an HTTP request to a Route
 * Handler (services hold the logic); errors come back in the shared `{ error }` envelope.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field → first message, from a 422 / field-level 409. */
  get fieldErrors(): Record<string, string> {
    const issues = this.details?.issues;
    if (!issues || typeof issues !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [field, messages] of Object.entries(issues)) {
      if (Array.isArray(messages) && typeof messages[0] === 'string') out[field] = messages[0];
    }
    return out;
  }
}

export async function api<T>(
  url: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      accept: 'application/json',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiClientError(res.status, code, message, details);
    }
    throw new ApiClientError(res.status, 'INTERNAL', 'Something went wrong');
  }
  return data as T;
}

/** Message to show for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  return 'Something went wrong. Check your connection and try again.';
}
