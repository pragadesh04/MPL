'use client';

import { ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TournamentRole } from '@/lib/schemas/domain';

export interface SwitcherTournament {
  id: string;
  name: string;
  roles: TournamentRole[];
}

const ROLE_LABEL: Record<TournamentRole, string> = {
  OWNER: 'Owner',
  CO_ADMIN: 'Co-admin',
  AUCTIONEER: 'Auctioneer',
  CAPTAIN: 'Captain',
  SOLDIER: 'Soldier',
};

export interface TournamentSwitcherProps {
  /** Every tournament I am in, with my role badge (§7 App shell). Lane A supplies the list. */
  tournaments: SwitcherTournament[];
  currentId?: string;
}

/** Placeholder switcher: renders whatever list it is given; Lane A wires the data (A2). */
export function TournamentSwitcher({ tournaments, currentId }: TournamentSwitcherProps) {
  const current = tournaments.find((t) => t.id === currentId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="max-w-56 justify-between gap-2">
          <span className="truncate">{current?.name ?? 'My tournaments'}</span>
          <ChevronsUpDown aria-hidden className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Tournaments</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tournaments.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted">You are not in a tournament yet.</p>
        ) : (
          tournaments.map((t) => (
            <DropdownMenuItem key={t.id} asChild>
              <Link href={`/t/${t.id}`} className="flex items-center justify-between gap-2">
                <span className="truncate">{t.name}</span>
                <span className="flex gap-1">
                  {t.roles.map((r) => (
                    <Badge key={r} variant="secondary">
                      {ROLE_LABEL[r]}
                    </Badge>
                  ))}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
