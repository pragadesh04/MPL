import type { ApiError } from '@/lib/schemas/api';
import type { AuctionCommand, AuctionSnapshot, AuctionWriteResponse } from '@/lib/schemas/auction';

/**
 * Browser calls to the auction endpoints. Every action is an HTTP request; the browser never
 * publishes (PLAN §6.1). Results are `{ ok, data }` / `{ ok: false, error }`, never thrown.
 */

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError['error']; status: number };

const NETWORK_ERROR: ApiError['error'] = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'Connection problem. Check your network and try again.',
};

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as T };
    const error =
      body && typeof body === 'object' && 'error' in body
        ? (body as ApiError).error
        : { code: 'INTERNAL' as const, message: 'Something went wrong' };
    return { ok: false, error, status: res.status };
  } catch {
    return { ok: false, error: NETWORK_ERROR, status: 0 };
  }
}

const base = (tournamentId: string): string => `/api/tournaments/${tournamentId}/auction`;
const withLive = (url: string, liveCode?: string): string =>
  liveCode ? `${url}?liveCode=${encodeURIComponent(liveCode)}` : url;

export function fetchSnapshot(
  tournamentId: string,
  liveCode?: string,
): Promise<ApiResult<AuctionSnapshot>> {
  return request(withLive(base(tournamentId), liveCode));
}

export function postTick(
  tournamentId: string,
  liveCode?: string,
): Promise<ApiResult<AuctionSnapshot>> {
  return request(`${base(tournamentId)}/tick`, {
    method: 'POST',
    body: JSON.stringify(liveCode ? { liveCode } : {}),
  });
}

export function postBid(
  tournamentId: string,
  body: { amount: number; expectedVersion: number; commandId: string; teamId?: string },
): Promise<ApiResult<AuctionWriteResponse>> {
  return request(`${base(tournamentId)}/bids`, { method: 'POST', body: JSON.stringify(body) });
}

export function postCommand(
  tournamentId: string,
  command: AuctionCommand,
): Promise<ApiResult<AuctionWriteResponse>> {
  return request(`${base(tournamentId)}/commands`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

/** Errors after which local state is behind the server: refetch the snapshot. */
export function isStaleError(error: ApiError['error']): boolean {
  return error.code === 'OUTBID' || error.code === 'TOO_LATE' || error.code === 'CONFLICT';
}

export function newCommandId(): string {
  return crypto.randomUUID();
}
