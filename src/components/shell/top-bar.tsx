import { BrandLockup } from '@/components/brand/brand-mark';
import Link from 'next/link';
import type * as React from 'react';
import { SoundToggle } from './sound-toggle';
import { TournamentSwitcher, type SwitcherTournament } from './tournament-switcher';
import { UserMenu } from './user-menu';

export interface TopBarProps {
  user: { displayName: string; username: string } | null;
  tournaments: SwitcherTournament[];
  currentTournamentId?: string;
  /** Extra controls before the sound toggle (the notification bell). */
  actions?: React.ReactNode;
}

/** App shell top bar (§7): logo, tournament switcher, sound toggle, user menu. */
export function TopBar({ user, tournaments, currentTournamentId, actions }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link href={user ? '/dashboard' : '/'} aria-label="MPL home">
          <BrandLockup />
        </Link>
        {user ? (
          <TournamentSwitcher tournaments={tournaments} currentId={currentTournamentId} />
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {user ? actions : null}
          <SoundToggle />
          {user ? (
            <UserMenu displayName={user.displayName} username={user.username} />
          ) : (
            <Link href="/login" className="px-3 text-sm font-semibold text-lime">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
