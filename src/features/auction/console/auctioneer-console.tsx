'use client';

import { useMemo, useState } from 'react';
import { toast } from '@/components/ui/sonner';
import { useAuction } from '../shared/auction-context';
import { usePresence } from '../realtime/use-presence';
import { useServerNow } from '../realtime/use-server-clock';
import { auctionPhase, teamBidState, type TeamBidState } from '../shared/phase';
import type { AuctionViewer } from '../shared/types';
import { ConsoleHeader } from './console-header';
import { ResetDialog, ShortcutsDialog, UndoDialog } from './console-dialogs';
import {
  consoleAccess,
  nextBlock,
  pauseBlock,
  soldBlock,
  startRoundBlock,
  unsoldBlock,
} from './console-state';
import { ControllerBanner } from './controller-banner';
import { LotPanel } from './lot-panel';
import { SidePanel } from './side-panel';
import { TeamStrip } from './team-strip';
import { useAuctionSounds } from './use-auction-sounds';
import { useConsoleActions } from './use-console-actions';
import { useConsoleShortcuts } from './use-console-shortcuts';

export interface AuctioneerConsoleProps {
  viewer: AuctionViewer;
}

/**
 * Auctioneer console (desktop, PLAN §7.6). One organiser controls it at a time; everyone else
 * sees the same live state read-only, with the reason and a Take control button. Every action is
 * an HTTP command; the server re-checks control, version and the rules.
 */
export function AuctioneerConsole({ viewer }: AuctioneerConsoleProps) {
  const { snapshot, offsetMs, live, bid, command, info } = useAuction();
  const { settings } = info;
  const { pending, run } = useConsoleActions();
  const busy = pending !== null;
  const [dialog, setDialog] = useState<'undo' | 'reset' | 'help' | null>(null);
  const presence = usePresence(info.tournamentId, { enter: true });
  const serverNow = useServerNow(offsetMs, 500);
  useAuctionSounds();

  const phase = auctionPhase(snapshot);
  const access = consoleAccess(snapshot, viewer, info.organiserNames);
  const canAct = access.canAct;
  const teams = useMemo(
    () => [...snapshot.teams].sort((a, b) => a.sortOrder - b.sortOrder),
    [snapshot.teams],
  );
  const bidStates: Record<string, TeamBidState> = Object.fromEntries(
    teams.map((t) => [t.id, teamBidState(snapshot, t.id, settings, serverNow)]),
  );
  const blocks = {
    next: nextBlock(snapshot),
    startRound: startRoundBlock(snapshot),
    sold: soldBlock(snapshot),
    unsold: unsoldBlock(snapshot),
    pause: pauseBlock(snapshot),
  };

  /** Shortcut / button guard: explain instead of sending a request that will fail. */
  const guard = (block: string | null): boolean => {
    if (!canAct) {
      toast(access.reason ?? 'The console is read-only for you.');
      return false;
    }
    if (block) {
      toast(block);
      return false;
    }
    return !busy;
  };

  type Write = Parameters<typeof run>[1];
  /** Send one console command unless it is blocked (then explain) or another is in flight. */
  const send = (key: string, block: string | null, write: Write): void => {
    if (guard(block)) void run(key, write);
  };

  const actions = {
    next: () => send('next', blocks.next, () => command({ type: 'next' })),
    pick: (playerId: string) =>
      send('next', blocks.next, () => command({ type: 'next', playerId })),
    startRound: () =>
      send('start-round', blocks.startRound, () => command({ type: 'start-round' })),
    sold: () => send('sold', blocks.sold, () => command({ type: 'sold' })),
    unsold: () => send('unsold', blocks.unsold, () => command({ type: 'unsold' })),
    togglePause: () =>
      send('pause', blocks.pause, () =>
        command({ type: snapshot.status === 'AUCTION_PAUSED' ? 'resume' : 'pause' }),
      ),
    undo: () => {
      if (guard(null)) setDialog('undo');
    },
    bidFor: (teamId: string, amount: number) => {
      if (!settings.allowAuctioneerBids) return;
      const state = bidStates[teamId];
      const block = state?.canBid ? null : (state?.reason ?? 'This team can’t bid');
      const team = teams.find((t) => t.id === teamId);
      send('bid', block, async () => {
        const res = await bid(amount, teamId);
        if (res.ok) toast.success(`${amount} MP entered for ${team?.name ?? 'the team'}`);
        return res;
      });
    },
  };

  useConsoleShortcuts(
    {
      bidForTeam: (i) => {
        const team = teams[i];
        const nextBid = team ? bidStates[team.id]?.nextBid : null;
        if (team && nextBid !== null && nextBid !== undefined) actions.bidFor(team.id, nextBid);
      },
      sold: actions.sold,
      unsold: actions.unsold,
      togglePause: actions.togglePause,
      next: actions.next,
      undo: actions.undo,
      help: () => setDialog('help'),
    },
    dialog === null,
  );

  const closeDialog = (open: boolean): void => {
    if (!open) setDialog(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <ControllerBanner
        access={access}
        canControl={viewer.canControl}
        nobody={snapshot.controllerUserId === null}
        disabled={busy}
        onTakeControl={() => void run('take-control', () => command({ type: 'take-control' }))}
      />
      {!canAct && access.reason ? (
        <p className="text-sm text-muted">Read-only: {access.reason}</p>
      ) : null}

      <ConsoleHeader
        tournamentName={info.tournamentName}
        phase={phase}
        round={snapshot.round}
        live={live}
        canAct={canAct}
        busy={busy}
        canReset={viewer.canReset}
        nextBlocked={blocks.next}
        startRoundBlocked={blocks.startRound}
        pauseBlocked={blocks.pause}
        onStart={actions.next}
        onStartRound={actions.startRound}
        onTogglePause={actions.togglePause}
        onUndo={actions.undo}
        onReset={() => setDialog('reset')}
        onShortcuts={() => setDialog('help')}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <LotPanel
            snapshot={snapshot}
            offsetMs={offsetMs}
            phase={phase}
            bidTimerSeconds={settings.bidTimerSeconds}
            canAct={canAct}
            busy={busy}
            soldBlocked={blocks.sold}
            unsoldBlocked={blocks.unsold}
            nextBlocked={blocks.next}
            onSold={actions.sold}
            onUnsold={actions.unsold}
            onNext={actions.next}
            onPick={actions.pick}
          />
          <TeamStrip
            teams={teams}
            maxPlayers={settings.maxPlayersPerTeam}
            bidStates={bidStates}
            leadingTeamId={snapshot.current?.currentTeamId ?? null}
            online={presence.online}
            presenceAvailable={presence.available}
            captainUserIds={info.captainUserIds}
            showFallback={settings.allowAuctioneerBids}
            canAct={canAct}
            readOnlyReason={viewer.canControl ? 'Take control first' : 'Read-only'}
            busy={busy}
            onBid={actions.bidFor}
          />
        </div>
        <SidePanel
          snapshot={snapshot}
          maxPlayers={settings.maxPlayersPerTeam}
          canRoster={viewer.canRoster}
          canAct={canAct}
          busy={busy}
          nextBlocked={blocks.next}
          onPick={actions.pick}
          onAuctionAgain={(playerId) =>
            void run('auction-again', () => command({ type: 'auction-again', playerId }))
          }
          onAssign={(playerId, teamId) =>
            void run('assign', () => command({ type: 'assign', playerId, teamId }))
          }
        />
      </div>

      <UndoDialog
        open={dialog === 'undo'}
        onOpenChange={closeDialog}
        pending={busy}
        onConfirm={async (reason) => {
          const ok = await run('undo', () => command({ type: 'undo', reason }));
          if (ok) toast.success('Last sale undone');
          return ok;
        }}
      />
      {viewer.canReset ? (
        <ResetDialog
          open={dialog === 'reset'}
          onOpenChange={closeDialog}
          pending={busy}
          tournamentName={info.tournamentName}
          onConfirm={async (confirmName) => {
            const ok = await run('reset', () => command({ type: 'reset', confirmName }));
            if (ok) toast.success('Auction reset. Purses refunded');
            return ok;
          }}
        />
      ) : null}
      <ShortcutsDialog open={dialog === 'help'} onOpenChange={closeDialog} />
    </div>
  );
}
