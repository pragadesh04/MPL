'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeNavHref, type TournamentNavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * Shared tournament navigation (PLAN §13.8 I3), rendered once by `t/[id]/layout.tsx` for every
 * lane's pages. The server computes `items` from the viewer's roles and the tournament status
 * (`tournamentNavItems`), so each role only sees links to pages it can open.
 */
export function TournamentNav({ items }: { items: TournamentNavItem[] }) {
  const pathname = usePathname();
  const active = activeNavHref(items, pathname);
  if (items.length <= 1) return null;
  return (
    <nav aria-label="Tournament" className="-mx-4 mb-6 overflow-x-auto px-4 print:hidden">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {items.map((item) => {
          const isActive = item.href === active;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-semibold tracking-wider uppercase transition-colors',
                  isActive
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
