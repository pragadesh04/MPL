'use client';

import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MpAmount } from '@/components/ui/mp-amount';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamChip } from '@/components/ui/team-chip';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { BidHistory, SoldierPhoto } from '../shared/display';
import { ACQUIRED_LABEL } from '../shared/phase';
import { waitingPool } from './console-state';

interface SidePanelProps {
  snapshot: AuctionSnapshot;
  maxPlayers: number;
  canRoster: boolean;
  /** Console commands (open from the pool) are accepted from this viewer. */
  canAct: boolean;
  busy: boolean;
  nextBlocked: string | null;
  onPick: (playerId: string) => void;
  onAuctionAgain: (playerId: string) => void;
  onAssign: (playerId: string, teamId: string) => void;
}

/** Console side panel (§7.6): bids, waiting pool, unsold list (Auction again / Assign), sold. */
export function SidePanel({
  snapshot,
  maxPlayers,
  canRoster,
  canAct,
  busy,
  nextBlocked,
  onPick,
  onAuctionAgain,
  onAssign,
}: SidePanelProps) {
  const pool = waitingPool(snapshot);
  const sold = snapshot.teams.flatMap((team) => team.members.map((m) => ({ ...m, team })));
  const currentId = snapshot.current?.playerId ?? null;

  return (
    <aside className="rounded-lg border border-border bg-surface p-4">
      <Tabs defaultValue="bids">
        <TabsList className="w-full [&>button]:px-1.5 [&>button]:text-xs">
          <TabsTrigger value="bids">Bids</TabsTrigger>
          <TabsTrigger value="pool">Pool ({pool.length})</TabsTrigger>
          <TabsTrigger value="unsold">Unsold ({snapshot.unsold.length})</TabsTrigger>
          <TabsTrigger value="sold">Sold ({sold.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bids">
          {currentId ? (
            <BidHistory snapshot={snapshot} playerId={currentId} limit={20} />
          ) : (
            <p className="text-sm text-muted">No soldier on the block.</p>
          )}
        </TabsContent>

        <TabsContent value="pool">
          {pool.length === 0 ? (
            <p className="text-sm text-muted">The pool is empty.</p>
          ) : (
            <ul className="space-y-2">
              {pool.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <SoldierPhoto name={p.name} photoUrl={p.photoUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.name}</span>
                    {p.ign ? (
                      <span className="block truncate text-xs text-muted">{p.ign}</span>
                    ) : null}
                  </span>
                  <MpAmount value={p.basePrice} size="sm" />
                  {canAct ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || nextBlocked !== null}
                      title={nextBlocked ?? undefined}
                      aria-label={`Put ${p.name} on the block`}
                      onClick={() => onPick(p.id)}
                    >
                      Open
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="unsold">
          {snapshot.unsold.length === 0 ? (
            <p className="text-sm text-muted">Nobody is unsold.</p>
          ) : (
            <ul className="space-y-3">
              {snapshot.unsold.map((p) => (
                <li key={p.id} className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <SoldierPhoto name={p.name} photoUrl={p.photoUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <MpAmount value={p.basePrice} size="sm" />
                  </div>
                  {canRoster ? (
                    <div className="flex flex-wrap gap-2 pl-10">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Auction ${p.name} again`}
                        onClick={() => onAuctionAgain(p.id)}
                      >
                        <RefreshCwIcon aria-hidden="true" />
                        Auction again
                      </Button>
                      <Select
                        value=""
                        disabled={busy}
                        onValueChange={(teamId) => {
                          if (teamId) onAssign(p.id, teamId);
                        }}
                      >
                        <SelectTrigger size="sm" aria-label={`Assign ${p.name} to a squad`}>
                          <SelectValue placeholder="Assign…" />
                        </SelectTrigger>
                        <SelectContent>
                          {snapshot.teams.map((t) => {
                            const full = t.squadSize >= maxPlayers;
                            return (
                              <SelectItem key={t.id} value={t.id} disabled={full}>
                                {t.shortName} · {t.name} ({t.squadSize}/{maxPlayers}
                                {full ? ', full' : ''})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="sold">
          {sold.length === 0 ? (
            <p className="text-sm text-muted">No sales yet.</p>
          ) : (
            <ul className="space-y-2">
              {sold.map((m) => (
                <li key={m.playerId} className="flex items-center gap-2 text-sm">
                  <SoldierPhoto name={m.name} photoUrl={m.photoUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <TeamChip
                    name={m.team.name}
                    shortName={m.team.shortName}
                    color={m.team.color}
                    size="sm"
                    hideName
                  />
                  {ACQUIRED_LABEL[m.acquiredVia] ? (
                    <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-widest text-sand uppercase">
                      {ACQUIRED_LABEL[m.acquiredVia]}
                    </span>
                  ) : null}
                  <MpAmount value={m.price} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
