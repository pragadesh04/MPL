'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Format navigation (Lane C pages only). Auction, setup and people links are added by Phase 2
 * integration (I3) together with role-based navigation in the app shell.
 */
export function TournamentNav({
  tournamentId,
  isOrganiser,
}: {
  tournamentId: string;
  isOrganiser: boolean;
}) {
  const pathname = usePathname();
  const base = `/t/${tournamentId}`;
  const items = [
    { href: base, label: 'Home' },
    { href: `${base}/matches`, label: 'Matches' },
    { href: `${base}/groups`, label: 'Groups' },
    { href: `${base}/knockout`, label: 'Knockout' },
    { href: `${base}/teams-overview`, label: 'Teams' },
    { href: `${base}/stats`, label: 'Stats' },
    ...(isOrganiser ? [{ href: `${base}/audit`, label: 'Audit log' }] : []),
  ];
  return (
    <nav aria-label="Tournament" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {items.map((item) => {
          const active = item.href === base ? pathname === base : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-semibold tracking-wider uppercase transition-colors',
                  active
                    ? 'border-lime text-lime'
                    : 'border-transparent text-muted hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
