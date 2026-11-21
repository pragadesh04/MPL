import { Clock, Coins, Gavel, ShieldQuestion, Swords, TrendingUp, Users } from 'lucide-react';
import type { RuleCard } from '../rules-of-engagement';

const ICONS: Record<RuleCard['id'], typeof Coins> = {
  purse: Coins,
  squad: Users,
  opening: Gavel,
  raise: TrendingUp,
  timer: Clock,
  unsold: ShieldQuestion,
  format: Swords,
};

/** "Rules of engagement" (§7): cards generated from the tournament settings. */
export function RulesCards({ rules }: { rules: RuleCard[] }) {
  return (
    <section aria-labelledby="rules-heading" className="space-y-3">
      <h2 id="rules-heading" className="font-display text-2xl tracking-wide">
        Rules of engagement
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rules.map((r) => {
          const Icon = ICONS[r.id];
          return (
            <li
              key={r.id}
              className={r.id === 'format' ? 'sm:col-span-2 lg:col-span-3' : undefined}
            >
              <div className="flex h-full gap-3 rounded-lg border border-border bg-surface/80 p-4">
                <Icon className="mt-0.5 size-5 shrink-0 text-lime" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-widest text-muted uppercase">
                    {r.title}
                  </p>
                  <p className="font-display text-2xl tracking-wide text-foreground">{r.value}</p>
                  <p className="mt-1 text-sm text-muted">{r.detail}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
