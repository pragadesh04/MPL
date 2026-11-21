import type { FormatPlan } from '@/lib/rules/planFormat';
import type { StandingRow } from '@/lib/rules/computeStandings';
import type { TournamentTree } from '@/lib/rules/buildTournamentTree';
import type { MatchSource, TournamentRole } from '@/lib/schemas/domain';
import type { MatchStage, MatchStatus, TournamentStatus } from '@/lib/schemas/enums';
import type { TournamentSettings } from '@/lib/schemas/settings';

/**
 * Read models for Lane C screens (groups, knockout, matches hub, tournament home, big screen).
 * Built on the server by `src/server/services/format/data.ts` and passed to client components as
 * plain JSON (dates are ISO strings).
 */

export interface TeamView {
  id: string;
  name: string;
  shortName: string;
  color: string;
  emoji: string | null;
  logoUrl: string | null;
  motto: string | null;
  captainName: string;
  /** MP spent in the auction (purse total − remaining). */
  spent: number;
  purseTotal: number;
  purseRemaining: number;
  sortOrder: number;
}

export interface GameView {
  gameNo: number;
  map: string | null;
  killsA: number;
  killsB: number;
  winnerTeamId: string | null;
}

export interface MatchView {
  id: string;
  matchNumber: number | null;
  stage: MatchStage;
  groupId: string | null;
  groupName: string | null;
  matchday: number | null;
  round: number | null;
  slot: number | null;
  /** "Group A · Matchday 2", "Semi-final", "3rd place"… */
  stageLabel: string;
  teamAId: string | null;
  teamBId: string | null;
  sourceA: MatchSource | null;
  sourceB: MatchSource | null;
  /** Placeholder text for an undecided slot ("Group A #1", "Winner of M9", "BYE"), else null. */
  labelA: string | null;
  labelB: string | null;
  bestOf: number;
  winnerTeamId: string | null;
  nextMatchId: string | null;
  nextSlot: 'A' | 'B' | null;
  isBye: boolean;
  status: MatchStatus;
  scheduledAt: string | null;
  games: GameView[];
  /** Games won per side once any game is recorded. */
  score: { a: number; b: number } | null;
}

export interface GroupView {
  id: string;
  name: string;
  teams: { teamId: string; pot: number | null }[];
  standings: StandingRow[];
  /** Every group match is DONE. */
  complete: boolean;
  /** Effective number of teams that qualify from this group. */
  advance: number;
  /** Complete, but teams in or around the qualifying places are still level on every tie-break. */
  needsTiebreakDraw: boolean;
}

export type FormatSettingsView = Pick<
  TournamentSettings,
  | 'groupCount'
  | 'advancePerGroup'
  | 'roundRobinLegs'
  | 'groupMatchBestOf'
  | 'knockoutBestOf'
  | 'finalBestOf'
  | 'pointsForWin'
  | 'thirdPlaceMatch'
>;

export interface FormatData {
  tournament: {
    id: string;
    name: string;
    status: TournamentStatus;
    announcement: string | null;
    liveCode: string;
    liveScreenEnabled: boolean;
  };
  settings: FormatSettingsView;
  plan: FormatPlan;
  teams: TeamView[];
  groups: GroupView[];
  /** Ordered by match number; byes (no number) last. */
  matches: MatchView[];
  tree: TournamentTree;
  /** Every group match is DONE and the knockout teams haven't been filled in yet. */
  readyForKnockout: boolean;
  championTeamId: string | null;
  serverNow: string;
}

export interface Viewer {
  userId: string;
  roles: TournamentRole[];
  /** Enter / edit results, mark live, reorder, schedule. */
  canEditMatches: boolean;
  /** Group draw, generate knockout. */
  canAdvance: boolean;
  canPostAnnouncement: boolean;
  isOrganiser: boolean;
  /** The captain's or soldier's own team, for "My team" filters and highlights. */
  myTeamId: string | null;
}

export interface FormatPageData extends FormatData {
  viewer: Viewer;
}
