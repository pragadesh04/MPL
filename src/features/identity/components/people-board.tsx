'use client';

import { AlertTriangle, Pencil } from 'lucide-react';
import { useState } from 'react';
import { InitialsAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MpAmount } from '@/components/ui/mp-amount';
import { TeamChip } from '@/components/ui/team-chip';
import type { ParticipantKind } from '@/lib/schemas/enums';
import { cn } from '@/lib/utils';
import type { OutgoingRequest } from '@/server/services/joining/requests';
import type { CaptainRow, Roster, SoldierRow } from '@/server/services/people/people';
import { EditPersonDialog, type EditablePerson } from './edit-person-dialog';
import { BulkApprove, PendingActions } from './pending-actions';
import { ResetPasswordButton } from './reset-password-button';
import { ShareLinkMenu } from './share-link-menu';
import { RequestRow } from './request-rows';
import { InviteStatusChip, SourceBadge } from './status-chips';

export type PeopleFilter = 'APPROVED' | 'PENDING' | 'REQUESTS' | 'REJECTED';

export interface PeopleBoardProps {
  tournament: {
    id: string;
    name: string;
    setup: boolean;
    defaultPurse: number;
    minBasePrice: number;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
  };
  roster: Roster;
  can: { manage: boolean; approve: boolean; resetPasswords: boolean };
  /** "Requests sent" rows (path C, A6). */
  requests?: OutgoingRequest[];
}

const isApprovedSoldier = (s: SoldierRow): boolean =>
  s.status !== 'PENDING_APPROVAL' && s.status !== 'REJECTED';

function since(date: Date | string | null): string | null {
  if (!date) return null;
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/** Captains tab and Soldiers tab with filters and counts (§7.2 step 3). */
export function PeopleBoard({ tournament, roster, can, requests }: PeopleBoardProps) {
  const [tab, setTab] = useState<ParticipantKind>('LEADER');
  const [filter, setFilter] = useState<PeopleFilter>('APPROVED');
  const [editing, setEditing] = useState<{ kind: ParticipantKind; person: EditablePerson } | null>(
    null,
  );

  const captains = {
    APPROVED: roster.captains.filter((c) => c.approval === 'APPROVED'),
    PENDING: roster.captains.filter((c) => c.approval === 'PENDING'),
    REJECTED: roster.captains.filter((c) => c.approval === 'REJECTED'),
  };
  const soldiers = {
    APPROVED: roster.soldiers.filter(isApprovedSoldier),
    PENDING: roster.soldiers.filter((s) => s.status === 'PENDING_APPROVAL'),
    REJECTED: roster.soldiers.filter((s) => s.status === 'REJECTED'),
  };
  const counts = (kind: ParticipantKind): Record<PeopleFilter, number> => {
    const src = kind === 'LEADER' ? captains : soldiers;
    return {
      APPROVED: src.APPROVED.length,
      PENDING: src.PENDING.length,
      REJECTED: src.REJECTED.length,
      REQUESTS: (requests ?? []).filter((r) => r.role === kind).length,
    };
  };
  const c = counts(tab);

  const min = captains.APPROVED.length * (tournament.minPlayersPerTeam - 1);
  const max = captains.APPROVED.length * (tournament.maxPlayersPerTeam - 1);
  const have = soldiers.APPROVED.length;
  const pct = max === 0 ? 0 : Math.min(100, Math.round((have / max) * 100));
  const minPct = max === 0 ? 0 : Math.round((min / max) * 100);

  const filters: { id: PeopleFilter; label: string }[] = [
    { id: 'APPROVED', label: 'Approved' },
    { id: 'PENDING', label: 'Pending' },
    { id: 'REQUESTS', label: 'Requests sent' },
    { id: 'REJECTED', label: 'Rejected' },
  ];

  const renderCaptain = (row: CaptainRow) => (
    <PersonLine
      key={row.id}
      name={row.name}
      ign={row.ign}
      duplicate={row.duplicate}
      meta={
        <>
          <SourceBadge source={row.source} />
          <MpAmount value={row.purseTotal} size="sm" />
          {row.approval === 'APPROVED' ? (
            <InviteStatusChip status={row.inviteStatus} teamColor={row.team?.color} />
          ) : null}
          {row.team ? <TeamChip {...row.team} size="sm" /> : null}
          {since(row.lastActivityAt) ? (
            <span className="text-xs text-muted">{since(row.lastActivityAt)}</span>
          ) : null}
          {row.rejectReason ? (
            <span className="text-xs text-blood">Rejected: {row.rejectReason}</span>
          ) : null}
        </>
      }
      actions={rowActions('LEADER', row, row.purseTotal, row.approval === 'APPROVED')}
    />
  );

  const renderSoldier = (row: SoldierRow) => (
    <PersonLine
      key={row.id}
      name={row.name}
      ign={row.ign}
      duplicate={row.duplicate}
      meta={
        <>
          <SourceBadge source={row.source} />
          <MpAmount value={row.basePrice} size="sm" />
          {isApprovedSoldier(row) ? <InviteStatusChip status={row.inviteStatus} /> : null}
          {since(row.lastActivityAt) ? (
            <span className="text-xs text-muted">{since(row.lastActivityAt)}</span>
          ) : null}
          {row.rejectReason ? (
            <span className="text-xs text-blood">Rejected: {row.rejectReason}</span>
          ) : null}
        </>
      }
      actions={rowActions('PLAYER', row, row.basePrice, isApprovedSoldier(row))}
    />
  );

  function rowActions(
    kind: ParticipantKind,
    row: CaptainRow | SoldierRow,
    amount: number,
    approved: boolean,
  ) {
    if (!approved) {
      const pending =
        'approval' in row ? row.approval === 'PENDING' : row.status === 'PENDING_APPROVAL';
      return pending && can.approve && tournament.setup ? (
        <PendingActions
          tournamentId={tournament.id}
          kind={kind}
          id={row.id}
          name={row.name}
          defaultAmount={kind === 'LEADER' ? tournament.defaultPurse : tournament.minBasePrice}
        />
      ) : null;
    }
    return (
      <>
        {can.manage ? (
          <ShareLinkMenu
            tournamentId={tournament.id}
            tournamentName={tournament.name}
            kind={kind}
            rowId={row.id}
            name={row.name}
            claimed={row.userId !== null}
          />
        ) : null}
        {can.resetPasswords && row.userId ? (
          <ResetPasswordButton tournamentId={tournament.id} userId={row.userId} name={row.name} />
        ) : null}
        {can.approve && tournament.setup ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Edit ${row.name}`}
            onClick={() =>
              setEditing({
                kind,
                person: { id: row.id, name: row.name, ign: row.ign, phone: row.phone, amount },
              })
            }
          >
            <Pencil aria-hidden />
          </Button>
        ) : null}
      </>
    );
  }

  const list =
    filter === 'REQUESTS'
      ? (requests ?? [])
          .filter((r) => r.role === tab)
          .map((r) => (
            <RequestRow
              key={r.id}
              tournamentId={tournament.id}
              request={r}
              canCancel={can.manage}
            />
          ))
      : tab === 'LEADER'
        ? captains[filter].map(renderCaptain)
        : soldiers[filter].map(renderSoldier);

  return (
    <div className="grid gap-4">
      <Card className="grid gap-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold">Squad capacity</span>
          <span className={cn(have >= min && have <= max ? 'text-lime' : 'text-amber')}>
            {have} approved soldiers / need {min}–{max}
          </span>
        </div>
        <div
          className="relative h-2.5 overflow-hidden rounded-full bg-surface-2"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={have}
          aria-label="Approved soldiers against squad capacity"
        >
          <div
            className={cn(
              'h-full rounded-full',
              have >= min && have <= max ? 'bg-lime' : 'bg-amber',
            )}
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground/70"
            style={{ left: `${minPct}%` }}
          />
        </div>
      </Card>

      <div role="tablist" aria-label="People" className="flex gap-2">
        {(['LEADER', 'PLAYER'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'rounded-md px-4 py-2 font-display text-lg tracking-wide transition-colors',
              tab === k
                ? 'bg-lime text-lime-foreground'
                : 'bg-surface-2 text-muted hover:text-foreground',
            )}
          >
            {k === 'LEADER' ? 'Captains' : 'Soldiers'}{' '}
            <span className="tabular">
              ({k === 'LEADER' ? captains.APPROVED.length : soldiers.APPROVED.length})
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        {filters.map((f) => (
          <Button
            key={f.id}
            type="button"
            size="sm"
            variant={filter === f.id ? 'default' : 'secondary'}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="tabular">{c[f.id]}</span>
          </Button>
        ))}
      </div>

      {filter === 'PENDING' && can.approve && tournament.setup ? (
        <BulkApprove
          tournamentId={tournament.id}
          kind={tab}
          ids={(tab === 'LEADER' ? captains.PENDING : soldiers.PENDING).map((r) => r.id)}
          defaultAmount={tab === 'LEADER' ? tournament.defaultPurse : tournament.minBasePrice}
        />
      ) : null}

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Nobody here yet.
        </p>
      ) : (
        <ul className="grid gap-2">{list}</ul>
      )}

      {editing ? (
        <EditPersonDialog
          key={editing.person.id}
          tournamentId={tournament.id}
          kind={editing.kind}
          person={editing.person}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function PersonLine({
  name,
  ign,
  duplicate,
  meta,
  actions,
}: {
  name: string;
  ign: string | null;
  duplicate: boolean;
  meta: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border bg-surface p-3',
        duplicate ? 'border-amber/60' : 'border-border',
      )}
    >
      <InitialsAvatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold">
          <span className="truncate">{name}</span>
          {ign ? <span className="truncate text-sm font-normal text-muted">{ign}</span> : null}
          {duplicate ? (
            <Badge variant="outline" className="border-amber/60 text-amber">
              <AlertTriangle aria-hidden className="size-3" /> Possible duplicate
            </Badge>
          ) : null}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">{meta}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </li>
  );
}
