import 'server-only';
import { randomInt } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { PlayerOrder } from '@/lib/schemas/settings';
import type { PlayerStatus } from '@/lib/schemas/enums';
import type { Db } from '../../db/client';
import { players } from '../../db/schema';

/**
 * Waiting-pool order (`players.auction_order`, PLAN §3.1 `playerOrder`). The next soldier on the
 * block is always the POOL soldier with the lowest `auction_order`.
 */

export interface OrderablePlayer {
  id: string;
  basePrice: number;
  auctionOrder: number | null;
  createdAt: Date;
}

/** Uniform integer in [0, max) from a CSPRNG (shuffles must not be predictable). */
export const secureRandom = (): number => randomInt(0, 2 ** 31) / 2 ** 31;

/** Pure: order `list` by the tournament's `playerOrder`. `random` returns [0, 1). */
export function orderPlayers<T extends OrderablePlayer>(
  list: readonly T[],
  order: PlayerOrder,
  random: () => number,
): T[] {
  const byManual = (a: T, b: T): number =>
    (a.auctionOrder ?? Number.MAX_SAFE_INTEGER) - (b.auctionOrder ?? Number.MAX_SAFE_INTEGER) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id);
  const sorted = [...list].sort(byManual);
  if (order === 'manualQueue') return sorted;
  if (order === 'byBasePriceDesc') return sorted.sort((a, b) => b.basePrice - a.basePrice);
  // Fisher–Yates over the stable manual order, so the result only depends on `random`.
  for (let i = sorted.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
  }
  return sorted;
}

/**
 * Put every soldier with one of `statuses` back into the pool, ordered by `playerOrder`, after
 * the soldiers already waiting. Returns how many moved.
 */
export async function requeue(
  tx: Db,
  tournamentId: string,
  statuses: PlayerStatus[],
  order: PlayerOrder,
  random: () => number,
): Promise<number> {
  const rows = await tx
    .select({
      id: players.id,
      basePrice: players.basePrice,
      auctionOrder: players.auctionOrder,
      createdAt: players.createdAt,
    })
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), inArray(players.status, statuses)));
  if (rows.length === 0) return 0;
  const start =
    (await maxPoolOrder(
      tx,
      tournamentId,
      rows.map((r) => r.id),
    )) + 1;
  const ordered = orderPlayers(rows, order, random);
  for (const [i, row] of ordered.entries()) {
    await tx
      .update(players)
      .set({
        status: 'POOL',
        auctionOrder: start + i,
        teamId: null,
        soldPrice: null,
        acquiredVia: null,
      })
      .where(eq(players.id, row.id));
  }
  return ordered.length;
}

/** Highest `auction_order` among POOL soldiers (0 when empty), ignoring `exclude`. */
export async function maxPoolOrder(
  tx: Db,
  tournamentId: string,
  exclude: string[] = [],
): Promise<number> {
  const rows = await tx
    .select({ id: players.id, order: players.auctionOrder })
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), eq(players.status, 'POOL')));
  return rows
    .filter((r) => !exclude.includes(r.id))
    .reduce((max, r) => Math.max(max, r.order ?? 0), 0);
}

/** Lowest `auction_order` among POOL soldiers (1 when empty). Used to put a soldier up next. */
export async function minPoolOrder(tx: Db, tournamentId: string): Promise<number> {
  const [row] = await tx
    .select({ min: sql<number | null>`min(${players.auctionOrder})` })
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), eq(players.status, 'POOL')));
  return row?.min === null || row?.min === undefined ? 1 : Number(row.min);
}

/** The next soldier to open: POOL with the lowest auction order (then oldest, then id). */
export async function nextPoolPlayerId(tx: Db, tournamentId: string): Promise<string | null> {
  const [row] = await tx
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), eq(players.status, 'POOL')))
    .orderBy(sql`${players.auctionOrder} asc nulls last`, asc(players.createdAt), asc(players.id))
    .limit(1);
  return row?.id ?? null;
}
