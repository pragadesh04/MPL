import { Check, Lock } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';
import { StatusPill } from '@/components/ui/status-pill';
import type { TournamentStatus } from '@/lib/schemas/enums';
import { cn } from '@/lib/utils';
import { STATUS_LABEL, STATUS_TONE } from '../lib/labels';

export type SetupStep = 'basics' | 'rules' | 'people' | 'teams' | 'review';

const STEPS: { id: SetupStep; label: string; href: (id: string) => string }[] = [
  { id: 'basics', label: 'Basics', href: (id) => `/t/${id}/setup?step=basics` },
  { id: 'rules', label: 'Rules', href: (id) => `/t/${id}/setup?step=rules` },
  { id: 'people', label: 'People', href: (id) => `/t/${id}/people` },
  { id: 'teams', label: 'Teams', href: (id) => `/t/${id}/teams` },
  { id: 'review', label: 'Review & Start', href: (id) => `/t/${id}/setup?step=review` },
];

export const stepHref = (tournamentId: string, step: SetupStep): string =>
  STEPS.find((s) => s.id === step)!.href(tournamentId);

/**
 * Setup wizard frame (§7.2): tournament name, status, and the 5-step progress rail shared by
 * /t/[id]/setup, /t/[id]/people and /t/[id]/teams.
 */
export function SetupShell({
  tournament,
  step,
  done = [],
  children,
  actions,
}: {
  tournament: { id: string; name: string; status: TournamentStatus };
  step: SetupStep;
  done?: SetupStep[];
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const locked = tournament.status !== 'DRAFT' && tournament.status !== 'READY';
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <StatusPill tone={STATUS_TONE[tournament.status]}>
            {STATUS_LABEL[tournament.status]}
          </StatusPill>
          <h1 className="font-display text-3xl tracking-wide">{tournament.name}</h1>
        </div>
        {actions}
      </header>
      <nav aria-label="Setup steps" className="overflow-x-auto">
        <ol className="flex min-w-max gap-1">
          {STEPS.map((s, i) => {
            const current = s.id === step;
            const complete = done.includes(s.id);
            return (
              <li key={s.id} className="flex-1">
                <Link
                  href={s.href(tournament.id)}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold tracking-wide uppercase transition-colors',
                    current
                      ? 'border-lime text-lime'
                      : 'border-border text-muted hover:border-lime-dim hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full border text-xs',
                      complete
                        ? 'border-lime bg-lime text-lime-foreground'
                        : current
                          ? 'border-lime'
                          : 'border-border',
                    )}
                  >
                    {complete ? <Check aria-hidden className="size-3.5" /> : i + 1}
                  </span>
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
      {locked ? (
        <p className="flex items-center gap-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          <Lock aria-hidden className="size-4" /> The tournament has started: setup is locked.
          Changes now go through logged admin overrides.
        </p>
      ) : null}
      {children}
    </div>
  );
}
