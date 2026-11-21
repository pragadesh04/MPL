import type { AuctionSnapshot } from '@/lib/schemas/auction';
import type { AuctionViewer } from '../shared/types';

/**
 * Pure helpers for the auctioneer console: who may act, and why each button is disabled. The
 * server re-checks everything; these only explain the state before a click (§7.3, §7.6).
 */

export interface ConsoleAccess {
  /** True when this viewer's console commands will be accepted. */
  canAct: boolean;
  isController: boolean;
  /** Display name of whoever holds control (null when nobody does). */
  controllerName: string | null;
  /** Why the console is read-only (null when the viewer can act). */
  reason: string | null;
}

export function consoleAccess(
  s: AuctionSnapshot,
  viewer: Pick<AuctionViewer, 'userId' | 'canControl'>,
  organiserNames: Record<string, string>,
): ConsoleAccess {
  const controller = s.controllerUserId;
  const isController = controller !== null && controller === viewer.userId;
  const controllerName =
    controller === null ? null : (organiserNames[controller] ?? 'Another organiser');
  if (!viewer.canControl) {
    return {
      canAct: false,
      isController: false,
      controllerName,
      reason: "Your role can watch the console but can't run it.",
    };
  }
  if (controller !== null && !isController) {
    return {
      canAct: false,
      isController: false,
      controllerName,
      reason: `${controllerName} is running the auction. Take control to act.`,
    };
  }
  return { canAct: true, isController, controllerName, reason: null };
}

/** Soldiers waiting in the pool (the one on the block is listed first with status ON_BLOCK). */
export function waitingPool(s: AuctionSnapshot): AuctionSnapshot['pool'] {
  return s.pool.filter((p) => p.status === 'POOL');
}

export const NO_POOL_REASON = 'No soldiers in the pool. Use Auction again on unsold soldiers first';

function notRunning(s: AuctionSnapshot): string | null {
  if (s.status === 'AUCTION_PAUSED') return 'The auction is paused. Resume it first';
  if (s.status !== 'AUCTION_LIVE') return 'The auction is not running';
  return null;
}

/** Why "Start new round" is disabled (null when it can run). */
export function startRoundBlock(s: AuctionSnapshot): string | null {
  return (
    notRunning(s) ??
    (s.current ? 'Close the current lot first' : null) ??
    (waitingPool(s).length === 0 ? NO_POOL_REASON : null)
  );
}

/** Why "Next soldier" / "Start auction" / pick from pool is disabled. */
export function nextBlock(s: AuctionSnapshot): string | null {
  return (
    notRunning(s) ??
    (s.current ? 'A soldier is on the block' : null) ??
    (waitingPool(s).length === 0 ? 'No soldiers in the pool' : null)
  );
}

/** Why "Sold now" is disabled. */
export function soldBlock(s: AuctionSnapshot): string | null {
  if (!s.current) return 'No soldier on the block';
  return notRunning(s) ?? (s.current.currentBid === null ? 'No bids yet. Use Mark unsold' : null);
}

/** Why "Mark unsold" is disabled. */
export function unsoldBlock(s: AuctionSnapshot): string | null {
  if (!s.current) return 'No soldier on the block';
  return notRunning(s);
}

/** Why Pause / Resume is disabled. */
export function pauseBlock(s: AuctionSnapshot): string | null {
  if (s.status === 'AUCTION_PAUSED' || s.status === 'AUCTION_LIVE') return null;
  return 'The auction is not running';
}
