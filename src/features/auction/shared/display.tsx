'use client';

import Image from 'next/image';
import { GavelIcon, ShieldOffIcon } from 'lucide-react';
import { InitialsAvatar } from '@/components/ui/avatar';
import { MpAmount } from '@/components/ui/mp-amount';
import { OpenSlot } from '@/components/ui/open-slot';
import { TeamChip } from '@/components/ui/team-chip';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { ACQUIRED_LABEL, RESULT_REASON_TEXT, findPlayer, findTeam } from './phase';

/**
 * Shared auction display pieces (§7.6–7.8, §12 look): soldier photo / initials, the lot card,
 * squad cards with open slots, bid history and the online dot. Team colour always comes with the
 * team name or short code (CLAUDE.md).
 */

type Team = AuctionSnapshot['teams'][number];

export function SoldierPhoto({
  name,
  photoUrl,
  size = 'default',
  className,
}: {
  name: string;
  photoUrl: string | null;
  size?: 'sm' | 'default' | 'lg' | 'xl';
  className?: string;
}) {
  const px = { sm: 32, default: 40, lg: 56, xl: 160 }[size];
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name}
        width={px}
        height={px}
        unoptimized
        className={cn('shrink-0 rounded-md object-cover ring-1 ring-border', className)}
      />
    );
  }
  if (size === 'xl') {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'grid size-40 shrink-0 place-items-center rounded-xl bg-surface-2 font-display text-6xl text-lime ring-1 ring-border',
          className,
        )}
      >
        {name
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()}
      </span>
    );
  }
  return <InitialsAvatar name={name} size={size} className={className} />;
}

/** The soldier on the block: photo, name, IGN, base price (struck through when re-auctioned). */
export function LotCard({
  snapshot,
  className,
}: {
  snapshot: AuctionSnapshot;
  className?: string;
}) {
  const lot = snapshot.current;
  const player = findPlayer(snapshot, lot?.playerId);
  if (!lot || !player) return null;
  const leader = findTeam(snapshot, lot.currentTeamId);
  return (
    <div className={cn('flex flex-col items-center gap-3 text-center', className)}>
      <SoldierPhoto name={player.name} photoUrl={player.photoUrl} size="xl" />
      <div>
        <h2 className="font-display text-3xl tracking-wide">{player.name}</h2>
        {player.ign ? <p className="text-sm text-muted">In-game: {player.ign}</p> : null}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted">
        <span>Base</span>
        {lot.isReauction ? (
          <>
            <span className="line-through">
              <MpAmount value={lot.originalBasePrice} size="sm" />
            </span>
            <MpAmount value={lot.basePrice} size="sm" className="text-amber" />
            <span className="rounded-sm bg-amber/15 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-widest text-amber uppercase">
              Re-auction
            </span>
          </>
        ) : (
          <MpAmount value={lot.basePrice} size="sm" />
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs tracking-widest text-muted uppercase">
          {lot.currentBid === null ? 'Opening bid' : 'Current bid'}
        </span>
        <MpAmount value={lot.currentBid ?? lot.nextBid} size="xl" />
      </div>
      {leader ? (
        <div
          style={teamStyle(leader.color)}
          className="bg-team text-on-team flex items-center gap-2 rounded-md px-4 py-2 font-display text-lg tracking-wide"
        >
          <span aria-hidden="true">{leader.emoji}</span>
          <span>
            {leader.name} ({leader.shortName}) leads
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted">No bids yet</p>
      )}
    </div>
  );
}

/** "SOLD to Red Rhinos for 12 MP" / "UNSOLD · No bids" strip for the last closed lot. */
export function LastResultStrip({ snapshot }: { snapshot: AuctionSnapshot }) {
  const r = snapshot.lastResult;
  if (!r) return null;
  const player = findPlayer(snapshot, r.playerId);
  const team = findTeam(snapshot, r.teamId);
  const sold = r.result === 'SOLD';
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm',
        sold ? 'border-gold/40 bg-gold/10' : 'border-border bg-surface-2',
      )}
    >
      {sold ? (
        <GavelIcon className="size-4 text-gold" aria-hidden="true" />
      ) : (
        <ShieldOffIcon className="size-4 text-muted" aria-hidden="true" />
      )}
      <span className="font-bold tracking-widest uppercase">{sold ? 'Sold' : 'Unsold'}</span>
      <span>{player?.name ?? 'Soldier'}</span>
      {team ? (
        <>
          <span className="text-muted">→</span>
          <TeamChip name={team.name} shortName={team.shortName} color={team.color} size="sm" />
        </>
      ) : null}
      {sold && r.price !== null ? <MpAmount value={r.price} size="sm" /> : null}
      {!sold && r.reason ? (
        <span className="text-muted">· {RESULT_REASON_TEXT[r.reason] ?? r.reason}</span>
      ) : null}
    </div>
  );
}

/** Squad card (§7.6a, §12): team-colour top bar, purse spent bar, members, open slots. */
export function SquadCard({
  team,
  maxPlayers,
  highlight = false,
  hidePurse = false,
  className,
}: {
  team: Team;
  maxPlayers: number;
  highlight?: boolean;
  hidePurse?: boolean;
  className?: string;
}) {
  const spentPct = team.purseTotal > 0 ? Math.round((team.spent / team.purseTotal) * 100) : 0;
  const open = Math.max(0, maxPlayers - team.squadSize);
  return (
    <div
      style={teamStyle(team.color)}
      className={cn(
        'overflow-hidden rounded-lg border bg-surface',
        highlight ? 'border-team shadow-glow' : 'border-border',
        className,
      )}
    >
      <div className="bg-team h-1.5" aria-hidden="true" />
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <TeamChip name={team.name} shortName={team.shortName} color={team.color} />
            <p className="mt-0.5 truncate text-xs text-muted">Captain {team.captainName}</p>
          </div>
          <span className="tabular shrink-0 font-numeric text-sm text-muted">
            {team.squadSize}/{maxPlayers}
          </span>
        </div>
        {hidePurse ? null : (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>MP left</span>
              <MpAmount value={team.purseRemaining} size="sm" className="text-foreground" />
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label={`${team.name} spent ${spentPct}% of the purse`}
              aria-valuenow={spentPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="bg-team h-full" style={{ width: `${spentPct}%` }} />
            </div>
          </div>
        )}
        <ul className="space-y-1.5">
          {team.members.map((m) => (
            <li key={m.playerId} className="flex items-center gap-2 text-sm">
              <SoldierPhoto name={m.name} photoUrl={m.photoUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {ACQUIRED_LABEL[m.acquiredVia] ? (
                <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-widest text-sand uppercase">
                  {ACQUIRED_LABEL[m.acquiredVia]}
                </span>
              ) : null}
              <MpAmount value={m.price} size="sm" />
            </li>
          ))}
          {Array.from({ length: open }, (_, i) => (
            <li key={`open-${i}`}>
              <OpenSlot className="h-9" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Bid history for one soldier (fallback bids tagged), newest first. */
export function BidHistory({
  snapshot,
  playerId,
  limit = 10,
}: {
  snapshot: AuctionSnapshot;
  playerId: string | null;
  limit?: number;
}) {
  const rows = snapshot.recentBids
    .filter((b) => !playerId || b.playerId === playerId)
    .slice(0, limit);
  if (rows.length === 0) return <p className="text-sm text-muted">No bids yet.</p>;
  return (
    <ol className="space-y-1.5">
      {rows.map((b) => {
        const team = findTeam(snapshot, b.teamId);
        return (
          <li key={b.id} className="flex items-center gap-2 text-sm">
            {team ? (
              <TeamChip name={team.name} shortName={team.shortName} color={team.color} size="sm" />
            ) : null}
            {b.isFallback ? (
              <span className="text-[0.625rem] font-bold tracking-widest text-amber uppercase">
                Entered by organiser
              </span>
            ) : null}
            <MpAmount value={b.amount} size="sm" className="ml-auto" />
          </li>
        );
      })}
    </ol>
  );
}

/** Presence dot: green online, grey offline, hollow when presence is unavailable. */
export function OnlineDot({ online, available }: { online: boolean; available: boolean }) {
  const label = !available ? 'Connection status unknown' : online ? 'Online' : 'Offline';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        !available ? 'border border-muted' : online ? 'bg-success' : 'bg-muted/50',
      )}
    />
  );
}
