'use client';

import { BellRing, Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BoardCaptain } from '@/server/services/people/teams';
import { api, errorMessage } from '../lib/api';
import { ShareLinkMenu } from './share-link-menu';
import { CopyButton, WhatsAppButton } from './share';
import { InviteStatusChip } from './status-chips';
import { TeamCardPreview } from './team-card-preview';
import { TeamSetupForm } from './team-setup-form';

/** Teams onboarding tracker (§7.2 step 4): one card per approved captain. */
export function TeamsBoard({
  tournamentId,
  tournamentName,
  captains,
  canManage,
  canEdit,
  setup,
}: {
  tournamentId: string;
  tournamentName: string;
  captains: BoardCaptain[];
  canManage: boolean;
  canEdit: boolean;
  setup: boolean;
}) {
  const [editing, setEditing] = useState<BoardCaptain | null>(null);
  const [reminder, setReminder] = useState<string | null>(null);
  const unfinished = captains.filter((c) => !c.linked || !c.team);

  const remind = async (): Promise<void> => {
    try {
      const res = await api<{ captains: { name: string; link: string }[] }>(
        `/api/tournaments/${tournamentId}/teams/remind`,
        { method: 'POST' },
      );
      const lines = res.captains.map((c) => `• ${c.name}: ${c.link}`).join('\n');
      setReminder(
        `⏰ ${tournamentName}: captains, please finish your team setup (name, short code, colour) before the auction!\n${lines}`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const others = (leaderId: string) =>
    captains
      .filter((c) => c.team && c.leaderId !== leaderId)
      .map((c) => ({
        leaderId: c.leaderId,
        name: c.team!.name,
        shortName: c.team!.shortName,
        color: c.team!.color,
      }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {captains.length - unfinished.length} of {captains.length} teams ready
        </p>
        {canManage && setup && unfinished.length > 0 ? (
          <Button type="button" variant="secondary" onClick={remind}>
            <BellRing aria-hidden /> Send reminder ({unfinished.length})
          </Button>
        ) : null}
      </div>
      {captains.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          No approved captains yet. Add them on the People step.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {captains.map((c) => (
            <Card key={c.leaderId} className="grid gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <InviteStatusChip status={c.inviteStatus} teamColor={c.team?.color} />
                <div className="flex gap-1">
                  {canManage && setup ? (
                    <ShareLinkMenu
                      tournamentId={tournamentId}
                      tournamentName={tournamentName}
                      kind="LEADER"
                      rowId={c.leaderId}
                      name={c.name}
                      claimed={c.linked}
                    />
                  ) : null}
                  {canEdit && setup ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${c.name}'s team`}
                      onClick={() => setEditing(c)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </div>
              {c.team ? (
                <TeamCardPreview team={c.team} captainName={c.name} purse={c.purse} slots={1} />
              ) : (
                <div className="grid gap-1 rounded-lg border border-dashed border-border p-4 text-sm">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-muted">
                    {c.linked
                      ? 'Account linked — team not set up yet'
                      : 'Hasn’t claimed their link yet'}
                  </p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}&apos;s team</DialogTitle>
            <DialogDescription>Fix a typo or a colour clash. This is logged.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <TeamSetupForm
              endpoint={`/api/tournaments/${tournamentId}/teams/${editing.leaderId}`}
              captainName={editing.name}
              purse={editing.purse}
              initial={editing.team}
              otherTeams={others(editing.leaderId)}
              onSaved={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={reminder !== null} onOpenChange={(o) => !o && setReminder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reminder message</DialogTitle>
            <DialogDescription>
              Linked captains also got an in-app notification. Send this to your WhatsApp group.
            </DialogDescription>
          </DialogHeader>
          {reminder ? (
            <div className="grid gap-3">
              <pre className="max-h-60 overflow-auto rounded-md bg-surface-2 p-3 text-xs whitespace-pre-wrap">
                {reminder}
              </pre>
              <div className="flex gap-2">
                <CopyButton text={reminder} toastLabel="Message copied" />
                <WhatsAppButton text={reminder} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
