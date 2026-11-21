import { apiErrorSchema } from '@/lib/schemas/api';

/**
 * Browser fetch helper for Lane C Route Handlers. Throws `ApiClientError` with the server's
 * message (the API error envelope, src/lib/schemas/api.ts) so callers can toast it.
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
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(0, 'NETWORK', 'Network error: check your connection and try again.');
  }
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiClientError(res.status, code, message, details);
    }
    throw new ApiClientError(res.status, 'INTERNAL', 'Something went wrong');
  }
  return payload as T;
}

/** The message to show for any thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
