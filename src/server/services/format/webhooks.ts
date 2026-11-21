import 'server-only';
import { inArray } from 'drizzle-orm';
import type { OnCommit, Tx } from '../../db/client';
import { teams } from '../../db/schema';
import { queueWebhookEvents, type OutgoingEvent } from '../webhooks/dispatch';

/**
 * Outgoing webhooks for the format stage (PLAN §6.4, integration of Lane B note 13 and Lane C's
 * "webhook dispatch" note): `groups.drawn`, `match.result` and `tournament.completed`.
 *
 * Data is display-ready and captured inside the transaction (team names, short codes, colours),
 * so Lane B's Discord formatter never queries again. Keys ending in `teamName` / `teamShortName`
 * / `teamColor` give the embed the winner's team colour. Queued only from `onCommit`.
 */
export interface TeamCard {
  name: string;
  shortName: string;
  color: string;
}

export async function loadTeamCards(
  tx: Tx,
  ids: readonly string[],
): Promise<Map<string, TeamCard>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await tx
    .select({ id: teams.id, name: teams.name, shortName: teams.shortName, color: teams.color })
    .from(teams)
    .where(inArray(teams.id, unique));
  return new Map(rows.map((r) => [r.id, { name: r.name, shortName: r.shortName, color: r.color }]));
}

const short = (card: TeamCard | undefined): string => card?.shortName ?? '?';
const named = (card: TeamCard | undefined): string =>
  card ? `${card.name} (${card.shortName})` : 'TBD';

/** `groups.drawn`: one line per group, e.g. "A: RHN · HWK · TSU". */
export function groupsDrawnEvent(
  groups: readonly { name: string; teamIds: readonly string[] }[],
  cards: Map<string, TeamCard>,
  matchCount: number,
): OutgoingEvent {
  return {
    event: 'groups.drawn',
    data: {
      groups: groups
        .map((g) => `${g.name}: ${g.teamIds.map((t) => short(cards.get(t))).join(' · ')}`)
        .join('\n'),
      matches: matchCount,
    },
  };
}

/** `match.result` for a decided match, coloured by the winner. */
export function matchResultEvent(input: {
  matchNumber: number | null;
  stage: string;
  teamA: TeamCard | undefined;
  teamB: TeamCard | undefined;
  winsA: number;
  winsB: number;
  winner: TeamCard | undefined;
}): OutgoingEvent {
  return {
    event: 'match.result',
    data: {
      match: input.matchNumber ? `M${input.matchNumber}` : 'Match',
      stage:
        input.stage === 'GROUP'
          ? 'Group stage'
          : input.stage === 'THIRD_PLACE'
            ? '3rd place'
            : 'Knockout',
      result: `${named(input.teamA)} ${input.winsA}–${input.winsB} ${named(input.teamB)}`,
      ...(input.winner
        ? {
            teamName: input.winner.name,
            teamShortName: input.winner.shortName,
            teamColor: input.winner.color,
          }
        : {}),
    },
  };
}

/** `tournament.completed`: the champion. */
export function tournamentCompletedEvent(champion: TeamCard | undefined): OutgoingEvent {
  return {
    event: 'tournament.completed',
    data: champion
      ? {
          champion: named(champion),
          teamName: champion.name,
          teamShortName: champion.shortName,
          teamColor: champion.color,
        }
      : {},
  };
}

/** Hand the events to webhook delivery after COMMIT (no-op without `onCommit`). */
export function queueFormatWebhooks(
  onCommit: OnCommit | null,
  tournamentId: string,
  events: OutgoingEvent[],
): void {
  if (!onCommit || events.length === 0) return;
  onCommit(() => {
    queueWebhookEvents(tournamentId, events);
  });
}
