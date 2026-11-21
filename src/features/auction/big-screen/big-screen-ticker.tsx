'use client';

import type { ReactNode } from 'react';
import { CrownIcon, GavelIcon, WalletIcon } from 'lucide-react';
import { MpAmount } from '@/components/ui/mp-amount';
import { TeamChip } from '@/components/ui/team-chip';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { lastSales, purseLeaderboard, topBuy } from './sales';

/** Bottom ticker (§7.7): last 5 sales, the most expensive buy and the MP-left leaderboard. */
export interface BigScreenTickerProps {
  snapshot: AuctionSnapshot;
  hidePurses: boolean;
}

export function BigScreenTicker({ snapshot, hidePurses }: BigScreenTickerProps) {
  const sales = lastSales(snapshot);
  const best = topBuy(snapshot);
  const board = purseLeaderboard(snapshot);

  return (
    <footer className="grid grid-cols-1 gap-4 border-t border-border bg-surface/90 px-6 py-4 backdrop-blur lg:grid-cols-[2fr_1fr_2fr]">
      <TickerBlock
        icon={<GavelIcon aria-hidden="true" className="size-4 text-gold" />}
        title="Last sales"
      >
        {sales.length === 0 ? (
          <p className="text-sm text-muted">No sales yet</p>
        ) : (
          <ol className="flex flex-wrap gap-x-5 gap-y-1">
            {sales.map((s) => (
              <li key={s.playerId} className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{s.name}</span>
                <span className="text-muted">→</span>
                <TeamChip
                  name={s.team.name}
                  shortName={s.team.shortName}
                  color={s.team.color}
                  size="sm"
                  hideName
                />
                <MpAmount value={s.price} size="sm" />
              </li>
            ))}
          </ol>
        )}
      </TickerBlock>

      <TickerBlock
        icon={<CrownIcon aria-hidden="true" className="size-4 text-gold" />}
        title="Top buy"
      >
        {best ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{best.name}</span>
            <TeamChip
              name={best.team.name}
              shortName={best.team.shortName}
              color={best.team.color}
              size="sm"
            />
            <MpAmount value={best.price} size="default" className="text-gold" />
          </div>
        ) : (
          <p className="text-sm text-muted">No sales yet</p>
        )}
      </TickerBlock>

      <TickerBlock
        icon={<WalletIcon aria-hidden="true" className="size-4 text-lime" />}
        title="MP left"
      >
        {hidePurses ? (
          <p className="text-sm text-muted">Purses hidden</p>
        ) : (
          <ol className="flex flex-wrap gap-x-4 gap-y-1">
            {board.map((t, i) => (
              <li key={t.id} className="flex items-center gap-1.5 text-sm">
                <span className="tabular font-numeric text-muted">{i + 1}.</span>
                <TeamChip
                  name={t.name}
                  shortName={t.shortName}
                  color={t.color}
                  size="sm"
                  hideName
                />
                <MpAmount value={t.purseRemaining} size="sm" />
              </li>
            ))}
          </ol>
        )}
      </TickerBlock>
    </footer>
  );
}

function TickerBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="min-w-0 space-y-1.5">
      <h2 className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-widest text-muted uppercase">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
