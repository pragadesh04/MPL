import 'server-only';
import { bidBlockMessage, canTeamBid } from '@/lib/rules/canTeamBid';
import { endsAtAfterBid } from '@/lib/rules/timers';
import { can } from '@/lib/permissions';
import type { AuctionWriteResponse, PlaceBidRequest } from '@/lib/schemas/auction';
import { bids } from '../../db/schema';
import { forbidden, notFound, ruleViolation } from '../../errors';
import { writeAudit } from '../audit';
import { requireParticipant } from '../roles';
import { ensureController } from './control';
import { effectiveBasePrice, emit, loadPlayer, loadTeams } from './engine';
import { outbid, runAuctionWrite, tooLate } from './run';
import { buildSnapshot } from './snapshot';

/**
 * `POST /api/tournaments/:id/auction/bids` (PLAN §2.6, §3.2, §6.2).
 *
 * WHO bids comes from the session's role in THIS tournament, never from the payload (§9 item 8):
 * - a captain always bids for their own team (a `teamId` for another team is not theirs to send);
 * - the controlling organiser may send `teamId` for a fallback bid (logged, "entered by").
 *
 * Inside the lock: settle → too late? → version check (409 OUTBID) → `canTeamBid` on fresh rows
 * → write the bid and extend the clock → publish `bid.placed` after COMMIT.
 */
export async function placeBid(
  userId: string | null,
  tournamentId: string,
  body: PlaceBidRequest,
): Promise<AuctionWriteResponse> {
  const access = await requireParticipant(userId, tournamentId);
  const isCaptain = access.roles.includes('CAPTAIN');
  const ownTeam = isCaptain && (!body.teamId || body.teamId === access.teamId);

  let teamId: string;
  let isFallback: boolean;
  if (ownTeam) {
    if (!access.teamId) throw ruleViolation('NO_TEAM', 'Set up your team before bidding');
    teamId = access.teamId;
    isFallback = false;
  } else if (body.teamId && can(access.roles, 'auction:control')) {
    teamId = body.teamId;
    isFallback = true;
  } else {
    throw forbidden('Only captains can bid');
  }

  await runAuctionWrite({
    tournamentId,
    actorUserId: access.userId,
    commandId: body.commandId,
    command: async (ctx, { settledSteps }) => {
      // The lot this bid was aimed at expired and was just settled.
      if (settledSteps > 0) throw tooLate();
      if (ctx.status !== 'AUCTION_LIVE') {
        throw ruleViolation('AUCTION_NOT_LIVE', bidBlockMessage('AUCTION_NOT_LIVE', null));
      }
      if (ctx.state.version !== body.expectedVersion) throw outbid(ctx.state.version);
      if (isFallback) {
        if (!ctx.settings.allowAuctioneerBids) {
          throw ruleViolation(
            'FALLBACK_DISABLED',
            'Auctioneer bids are turned off for this tournament',
          );
        }
        // After the version check: auto-taking control emits its own event.
        await ensureController(ctx, access.userId);
      }

      const team = (await loadTeams(ctx.tx, tournamentId)).find((t) => t.teamId === teamId);
      if (!team) throw notFound();
      const playerId = ctx.state.currentPlayerId;
      const player = playerId ? await loadPlayer(ctx.tx, tournamentId, playerId) : null;
      const lot = player
        ? {
            playerId: player.id,
            basePrice: effectiveBasePrice(player.basePrice, ctx.state.round, ctx.settings),
            currentBid: ctx.state.currentBid,
            currentTeamId: ctx.state.currentTeamId,
            endsAt: ctx.state.endsAt,
          }
        : null;

      const check = canTeamBid({
        status: ctx.status,
        lot,
        now: ctx.now,
        team: { id: team.teamId, squadSize: team.squadSize, purseRemaining: team.purseRemaining },
        settings: ctx.settings,
        amount: body.amount,
      });
      if (!check.ok) {
        if (check.reason === 'LOT_EXPIRED') throw tooLate();
        throw ruleViolation(check.reason, bidBlockMessage(check.reason, check.nextBid));
      }
      // canTeamBid passed, so a lot with a deadline exists.
      const endsAt = endsAtAfterBid(lot!.endsAt!, ctx.now, ctx.settings);

      const [row] = await ctx.tx
        .insert(bids)
        .values({
          tournamentId,
          playerId: lot!.playerId,
          teamId,
          amount: body.amount,
          round: ctx.state.round,
          enteredBy: access.userId,
          isFallback,
          createdAt: ctx.now,
        })
        .returning({ id: bids.id });

      ctx.state.currentBid = body.amount;
      ctx.state.currentTeamId = teamId;
      ctx.state.endsAt = endsAt;
      emit(ctx, 'bid.placed', {
        bidId: row!.id,
        playerId: lot!.playerId,
        teamId,
        amount: body.amount,
        endsAt: endsAt.toISOString(),
        isFallback,
        enteredByUserId: access.userId,
      });
      ctx.webhooks.push({
        event: 'bid.placed',
        data: {
          playerId: lot!.playerId,
          playerName: player!.name,
          teamId,
          teamName: team.name,
          teamShortName: team.shortName,
          teamColor: team.color,
          amount: body.amount,
          isFallback,
        },
      });
      if (isFallback) {
        await writeAudit(ctx.tx, {
          tournamentId,
          actorUserId: access.userId,
          action: 'auction.fallback_bid',
          after: { playerId: lot!.playerId, teamId, amount: body.amount, bidId: row!.id },
        });
      }
    },
  });

  return { snapshot: await buildSnapshot(tournamentId) };
}
