'use client';

import { Trash2, UserPlus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { InitialsAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { MembershipRole } from '@/lib/schemas/enums';
import type { MembersView } from '@/server/services/organisers/organisers';
import { api, errorMessage } from '../lib/api';
import { ROLE_LABEL } from '../lib/labels';
import { ConfirmByNameDialog } from './confirm-by-name-dialog';
import { FormError, FormField } from './form-field';
import { CopyButton, WhatsAppButton } from './share';

type Invitable = 'CO_ADMIN' | 'AUCTIONEER';

function expiresIn(date: Date | string): string {
  const ms = new Date(date).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
}

/** Settings → Organisers (§7.3), owner only. */
export function OrganisersPanel({
  tournamentId,
  tournamentName,
  view,
  currentUserId,
  isOwner,
}: {
  tournamentId: string;
  tournamentName: string;
  view: MembersView;
  currentUserId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [who, setWho] = useState('');
  const [role, setRole] = useState<Invitable>('CO_ADMIN');
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferTo, setTransferTo] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string): Promise<void> => {
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const invite = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ link: string }>(
        `/api/tournaments/${tournamentId}/organiser-invites`,
        {
          body: { emailOrUsername: who, role },
        },
      );
      setLink(res.link);
      setWho('');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const coAdmins = view.members.filter((m) => m.role === 'CO_ADMIN');
  const target = view.members.find((m) => m.userId === transferTo);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Organisers</CardTitle>
          <CardDescription>
            Co-admins can do everything except manage organisers, delete or transfer. Auctioneers
            run the auction console only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {view.members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                <InitialsAvatar name={m.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {m.displayName}
                    {m.userId === currentUserId ? ' (you)' : ''}
                  </p>
                  <p className="truncate text-xs text-muted">
                    @{m.username}
                    {m.addedByName ? ` · added by ${m.addedByName}` : ''}
                  </p>
                </div>
                {m.role === 'OWNER' || !isOwner ? (
                  <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>
                ) : (
                  <>
                    <select
                      aria-label={`Role for ${m.displayName}`}
                      value={m.role}
                      onChange={(e) =>
                        run(
                          () =>
                            api(`/api/tournaments/${tournamentId}/members/${m.userId}`, {
                              method: 'PATCH',
                              body: { role: e.target.value as MembershipRole },
                            }),
                          'Role changed',
                        )
                      }
                      className="h-9 rounded-md border border-border bg-input px-2 text-sm"
                    >
                      <option value="CO_ADMIN">Co-admin</option>
                      <option value="AUCTIONEER">Auctioneer</option>
                    </select>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${m.displayName}`}
                      onClick={() =>
                        run(
                          () =>
                            api(`/api/tournaments/${tournamentId}/members/${m.userId}`, {
                              method: 'DELETE',
                            }),
                          `${m.displayName} removed`,
                        )
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus aria-hidden className="size-5 text-lime" /> Invite organiser
            </CardTitle>
            <CardDescription>
              You get a single-use link (valid 7 days) for that username or email. Send it on
              WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form
              onSubmit={invite}
              className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
            >
              <FormField id="invite-who" label="Username or email">
                <Input
                  id="invite-who"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  required
                  minLength={3}
                />
              </FormField>
              <FormField id="invite-role" label="Role">
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Invitable)}
                  className="h-10 rounded-md border border-border bg-input px-3 text-sm"
                >
                  <option value="CO_ADMIN">Co-admin</option>
                  <option value="AUCTIONEER">Auctioneer</option>
                </select>
              </FormField>
              <Button type="submit" disabled={busy || who.trim().length < 3}>
                Create link
              </Button>
            </form>
            <FormError message={error} />
            {link ? (
              <div className="grid gap-2 rounded-md border border-lime/40 bg-lime/5 p-3">
                <p className="text-sm font-semibold">Invite link (shown once):</p>
                <p className="text-xs break-all text-muted">{link}</p>
                <div className="flex gap-2">
                  <CopyButton text={link} toastLabel="Invite link copied" />
                  <WhatsAppButton
                    text={`You're invited to help organise ${tournamentName} on MPL: ${link}`}
                  />
                </div>
              </div>
            ) : null}
            {view.invites.length > 0 ? (
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold">Pending invites</h3>
                <ul className="grid gap-2">
                  {view.invites.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span>
                        {i.emailOrUsername} · {ROLE_LABEL[i.role]}{' '}
                        <span className="text-muted">· {expiresIn(i.expiresAt)}</span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(
                            () => api(`/api/organiser-invites/${i.id}`, { method: 'DELETE' }),
                            'Invite revoked',
                          )
                        }
                      >
                        <X aria-hidden /> Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isOwner ? (
        <Card className="border-blood/40">
          <CardHeader>
            <CardTitle className="text-blood">Transfer ownership</CardTitle>
            <CardDescription>
              Hand this tournament to a co-admin. You become a co-admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {coAdmins.length === 0 ? (
              <p className="text-sm text-muted">Invite a co-admin first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {coAdmins.map((m) => (
                  <Button
                    key={m.userId}
                    type="button"
                    variant="outline"
                    onClick={() => setTransferTo(m.userId)}
                  >
                    Transfer to {m.displayName}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
          <ConfirmByNameDialog
            open={transferTo !== null}
            onOpenChange={(o) => !o && setTransferTo(null)}
            title={`Transfer ownership to ${target?.displayName ?? ''}?`}
            description="They get every owner right, including removing you. This can't be undone by you."
            tournamentName={tournamentName}
            confirmLabel="Transfer ownership"
            destructive
            onConfirm={async (confirmName) => {
              await api(`/api/tournaments/${tournamentId}/transfer-ownership`, {
                body: { toUserId: transferTo, confirmName },
              });
              toast.success('Ownership transferred');
              router.refresh();
            }}
          />
        </Card>
      ) : null}
    </div>
  );
}
