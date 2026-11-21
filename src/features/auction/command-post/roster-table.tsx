'use client';

import { useId, useState } from 'react';
import { SearchIcon, UserMinusIcon } from 'lucide-react';
import { InitialsAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TeamChip } from '@/components/ui/team-chip';
import { cn } from '@/lib/utils';
import {
  filterRoster,
  type RosterFilter,
  type RosterLiveStatus,
  type RosterRow,
} from './roster-status';
import type { ReleaseTarget } from './release-dialog';

const FILTERS: { value: RosterFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'CAPTAIN', label: 'Captains' },
  { value: 'SOLDIER', label: 'Soldiers' },
];

interface RosterTableProps {
  rows: RosterRow[];
  canRoster: boolean;
  busy: boolean;
  onRelease: (target: ReleaseTarget) => void;
}

/** "Registered (n)" (§7.6a): search, All · Captains · Soldiers, live squad / status, Release. */
export function RosterTable({ rows, canRoster, busy, onRelease }: RosterTableProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('ALL');
  const searchId = useId();
  const visible = filterRoster(rows, query, filter);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registered ({rows.length})</CardTitle>
        <CardDescription>
          Approve, delete, rename and role changes happen before Start, in the setup pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <label htmlFor={searchId} className="sr-only">
              Search the roster
            </label>
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              type="search"
              placeholder="Search name, IGN or @username"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div
            role="group"
            aria-label="Filter by role"
            className="inline-flex rounded-md border border-border bg-surface p-1"
          >
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-sm px-3 py-1 text-xs font-semibold tracking-wide uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  filter === f.value
                    ? 'bg-lime text-lime-foreground'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <span className="sr-only">Avatar</span>
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>IGN · Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Squad / status</TableHead>
              {canRoster ? (
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canRoster ? 6 : 5} className="py-6 text-center text-muted">
                  No one matches.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => {
                const team =
                  r.live.kind === 'CAPTAIN' || r.live.kind === 'SQUAD' ? r.live.team : null;
                return (
                  <TableRow key={`${r.kind}-${r.id}`}>
                    <TableCell>
                      <InitialsAvatar name={r.name} color={team?.color} size="sm" />
                    </TableCell>
                    <TableCell className="font-semibold">{r.name}</TableCell>
                    <TableCell className="text-muted">
                      {r.ign ?? '—'}
                      {r.username ? ` · @${r.username}` : ''}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'rounded-sm px-1.5 py-0.5 text-[0.625rem] font-bold tracking-widest uppercase',
                          r.kind === 'CAPTAIN' ? 'bg-gold/15 text-gold' : 'bg-surface-2 text-sand',
                        )}
                      >
                        {r.kind === 'CAPTAIN' ? 'Captain' : 'Soldier'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusCell live={r.live} />
                    </TableCell>
                    {canRoster ? (
                      <TableCell className="text-right">
                        {r.live.kind === 'SQUAD' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            aria-label={`Release ${r.name}`}
                            onClick={() => {
                              if (r.live.kind !== 'SQUAD') return;
                              onRelease({
                                playerId: r.id,
                                name: r.name,
                                teamName: r.live.team.name,
                                price: r.live.price,
                              });
                            }}
                          >
                            <UserMinusIcon aria-hidden="true" />
                            Release
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface StatusCellProps {
  live: RosterLiveStatus;
}

function StatusCell({ live }: StatusCellProps) {
  switch (live.kind) {
    case 'CAPTAIN':
      return live.team ? (
        <span className="inline-flex items-center gap-1.5">
          <TeamChip
            name={live.team.name}
            shortName={live.team.shortName}
            color={live.team.color}
            size="sm"
          />
          <span className="text-muted">({live.team.purseRemaining} MP left)</span>
        </span>
      ) : (
        <span className="text-muted">No team yet</span>
      );
    case 'SQUAD':
      return (
        <span className="inline-flex items-center gap-1.5">
          <TeamChip
            name={live.team.name}
            shortName={live.team.shortName}
            color={live.team.color}
            size="sm"
          />
          <span className="text-muted">({live.price} MP)</span>
          {live.badge ? (
            <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-widest text-sand uppercase">
              {live.badge}
            </span>
          ) : null}
        </span>
      );
    case 'ON_BLOCK':
      return <span className="font-semibold text-lime">On the block</span>;
    case 'POOL':
      return <span>In pool</span>;
    case 'UNSOLD':
      return <span className="text-amber">Unsold</span>;
    case 'OTHER':
      return <span className="text-muted">{live.label}</span>;
  }
}
