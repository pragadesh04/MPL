/**
 * Pure rule functions shared by client and server (PLAN.md §8, CLAUDE.md "Rules live in
 * src/lib/rules"). Services enforce them; the UI calls the same functions only to disable buttons
 * and explain why. Never re-implement a rule inline in a component or route.
 *
 * SHARED + FROZEN (Phase 0): this file's export list and the signatures in each module are the
 * contract. Each module is owned by one lane, which replaces the `NotImplementedError` body and
 * adds `<module>.test.ts` next to it (100% branch coverage). Changing a signature another lane
 * calls needs an integration note (PLAN §13.1).
 *
 * | Module                  | Owner  | PLAN      |
 * | ----------------------- | ------ | --------- |
 * | keys                    | Lane A | §2.3      |
 * | validateReadyToStart    | Lane A | §3.5      |
 * | nextValidBid            | Lane B | §3.1–3.2  |
 * | canTeamBid              | Lane B | §3.2      |
 * | timers                  | Lane B | §3.1, §6.2|
 * | reauctionPrice          | Lane B | §3.1      |
 * | allocateLeftovers       | Lane B | §3.4      |
 * | unsoldPolicy            | Lane B | §3.1, §3.3|
 * | planFormat              | Lane C | §4.1      |
 * | generateGroups          | Lane C | §4.2      |
 * | generateRoundRobin      | Lane C | §4.3      |
 * | computeStandings        | Lane C | §4.3      |
 * | knockout                | Lane C | §4.4      |
 * | assignMatchOrder        | Lane C | §4.6      |
 * | buildTournamentTree     | Lane C | §7.10a    |
 */

export { NotImplementedError } from './not-implemented';

// Lane A
export {
  generateKey,
  normalizeKey,
  formatKey,
  KEY_ALPHABET,
  KEY_LENGTH,
  type KeyKind,
} from './keys';
export {
  validateReadyToStart,
  type ReadyCaptain,
  type ReadySoldier,
  type ReadyToStartInput,
  type ReadyCheck,
  type ReadyCheckId,
  type ReadyToStartResult,
} from './validateReadyToStart';

// Lane B
export {
  minRaise,
  nextValidBid,
  quickRaiseOptions,
  isJumpBid,
  type LotPrice,
} from './nextValidBid';
export {
  canTeamBid,
  bidBlockMessage,
  customBidBounds,
  type BidBlockReason,
  type BidCheck,
  type CanTeamBidInput,
} from './canTeamBid';
export { lotEndsAt, endsAtAfterBid, breakEndsAt, remainingMs, type TimerSettings } from './timers';
export { reauctionPrice } from './reauctionPrice';
export {
  allocateLeftovers,
  type AllocationSoldier,
  type AllocationTeam,
  type AllocationStep,
  type AllocationResult,
} from './allocateLeftovers';
export {
  resolveUnsoldLot,
  afterRoundEnds,
  type UnsoldLotOutcome,
  type RoundEndAction,
} from './unsoldPolicy';

// Lane C
export { planFormat, type FormatPlan, type FormatSettings } from './planFormat';
export { generateGroups, type DrawTeam, type GroupDraft } from './generateGroups';
export { generateRoundRobin, type Fixture, type Matchday } from './generateRoundRobin';
export { computeStandings, type StandingMatch, type StandingRow } from './computeStandings';
export {
  seedKnockout,
  generateBracket,
  roundName,
  type KnockoutSeed,
  type SeedGroup,
  type BracketSlot,
  type BracketMatch,
} from './knockout';
export { assignMatchOrder, type OrderableMatch } from './assignMatchOrder';
export {
  buildTournamentTree,
  type TreeInputGroup,
  type TreeInputMatch,
  type TreeNode,
  type TournamentTree,
} from './buildTournamentTree';
