'use client';

import { Download, Printer } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { MpAmount } from '@/components/ui/mp-amount';
import { OpenSlot } from '@/components/ui/open-slot';
import { toast } from '@/components/ui/sonner';
import { TeamChip } from '@/components/ui/team-chip';
import type { AcquiredVia } from '@/lib/schemas/enums';
import { teamStyle } from '@/lib/team-color';
import type { PlayerView, TeamView } from '../types';

const BADGE: Partial<Record<AcquiredVia, string>> = {
  AUTO_ALLOCATED: 'Auto',
  RANDOM_SQUAD: 'Random',
  ADMIN_PICK: 'Admin pick',
};

/**
 * Teams overview (§7.9): one column per team with captain, soldiers (price and an Auto / Random /
 * Admin pick badge), the spent / remaining bar and open slots. Export as PNG for WhatsApp, or print.
 */
export function TeamsOverview({
  teams,
  players,
  maxPlayers,
  fileName,
}: {
  teams: TeamView[];
  players: PlayerView[];
  /** Squad cap incl. captain, for open slots. */
  maxPlayers: number;
  fileName: string;
}) {
  const board = useRef<HTMLDivElement>(null);

  async function exportPng(): Promise<void> {
    if (!board.current) return;
    try {
      const { toPng } = await import('html-to-image');
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-background')
        .trim();
      const url = await toPng(board.current, { pixelRatio: 2, backgroundColor: bg || undefined });
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
    } catch {
      toast.error('Couldn’t export the image on this device.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 print:hidden">
        <Button type="button" variant="outline" size="sm" onClick={exportPng}>
          <Download aria-hidden /> Export PNG
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden /> Print
        </Button>
      </div>
      <div
        ref={board}
        className="grid gap-4 p-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 print:grid-cols-4"
      >
        {teams.map((team) => {
          const squad = players.filter((p) => p.teamId === team.id);
          const open = Math.max(0, maxPlayers - 1 - squad.length);
          const pct = team.purseTotal > 0 ? Math.round((team.spent / team.purseTotal) * 100) : 0;
          return (
            <section
              key={team.id}
              style={teamStyle(team.color)}
              className="break-inside-avoid overflow-hidden rounded-lg border border-border bg-surface"
              aria-label={team.name}
            >
              <div className="bg-team h-2" aria-hidden />
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  {team.emoji ? (
                    <span className="text-2xl" aria-hidden>
                      {team.emoji}
                    </span>
                  ) : null}
                  <TeamChip
                    name={team.name}
                    shortName={team.shortName}
                    color={team.color}
                    size="lg"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted">
                    <span>
                      Spent <MpAmount value={team.spent} size="sm" />
                    </span>
                    <span>
                      Left <MpAmount value={team.purseRemaining} size="sm" />
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-surface-2"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={team.purseTotal}
                    aria-valuenow={team.spent}
                    aria-label={`${team.name} spent ${team.spent} of ${team.purseTotal} MP`}
                  >
                    {/* Width is data (share of the purse), so it can't be a class. */}
                    <div className="bg-team h-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-center justify-between gap-2 font-semibold">
                    <span className="truncate">{team.captainName}</span>
                    <span className="text-[0.625rem] font-bold tracking-widest text-gold uppercase">
                      Captain
                    </span>
                  </li>
                  {squad.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {p.name}
                        {p.ign ? <span className="ml-1 text-xs text-muted">({p.ign})</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {BADGE[p.acquiredVia] ? (
                          <span className="rounded-sm bg-amber/15 px-1 text-[0.625rem] font-bold text-amber uppercase">
                            {BADGE[p.acquiredVia]}
                          </span>
                        ) : null}
                        <MpAmount value={p.soldPrice} size="sm" />
                      </span>
                    </li>
                  ))}
                </ul>
                {Array.from({ length: open }, (_, i) => (
                  <OpenSlot key={i} className="h-8" />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
