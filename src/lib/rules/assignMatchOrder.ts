import type { MatchStage } from '../schemas/enums';
import { NotImplementedError } from './not-implemented';

/** Owner: Lane C (C1, C2, C3). PLAN §4.6. */

export interface OrderableMatch {
  id: string;
  stage: MatchStage;
  isBye: boolean;
  /** Group stage. */
  groupName?: string | null;
  matchday?: number | null;
  /** Knockout. */
  round?: number | null;
  slot?: number | null;
}

/**
 * Running order M1, M2… : group stage matchday by matchday with groups interleaved (A-MD1,
 * B-MD1, A-MD2…); knockout round by round, top half then bottom half; the 3rd-place match comes
 * before the final. Byes get no number. `startAt` continues numbering after earlier stages.
 */
export function assignMatchOrder(
  matches: OrderableMatch[],
  startAt?: number,
): { id: string; matchNumber: number | null }[] {
  void matches;
  void startAt;
  throw new NotImplementedError('assignMatchOrder', 'Lane C');
}
