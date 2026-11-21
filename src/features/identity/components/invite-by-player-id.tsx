'use client';

import { Search, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { InitialsAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatKey, normalizeKey } from '@/lib/rules/keys';
import type { ParticipantKind } from '@/lib/schemas/enums';
import { api, ApiClientError, errorMessage } from '../lib/api';
import { RoleChoice } from './role-choice';

interface Card2 {
  playerCode: string;
  displayName: string;
  ign: string | null;
  photoUrl: string | null;
}

/** Invite by Player ID (path C, §7.2 step 3): exact lookup → public card → role + amount → send. */
export function InviteByPlayerId({
  tournamentId,
  defaultPurse,
  minBasePrice,
}: {
  tournamentId: string;
  defaultPurse: number;
  minBasePrice: number;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [card, setCard] = useState<Card2 | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [role, setRole] = useState<ParticipantKind | undefined>();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setCard(null);
    setNotFound(false);
    const normal = normalizeKey(code);
    if (!normal) {
      setNotFound(true);
      return;
    }
    setBusy(true);
    try {
      setCard(await api<Card2>(`/api/players/by-code/${normal}`));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) setNotFound(true);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async (): Promise<void> => {
    if (!card || !role) return;
    setBusy(true);
    const value = amount.trim() === '' ? undefined : Number(amount);
    try {
      await api(`/api/tournaments/${tournamentId}/requests`, {
        body: {
          playerCode: card.playerCode,
          role,
          ...(role === 'LEADER' ? { purse: value } : { basePrice: value }),
        },
      });
      toast.success(`Request sent to ${card.displayName}`);
      setCard(null);
      setCode('');
      setRole(undefined);
      setAmount('');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search aria-hidden className="size-5 text-lime" /> Invite by Player ID
        </CardTitle>
        <CardDescription>Players find their ID on their dashboard, e.g. #4K9QX7.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form onSubmit={lookup} className="flex gap-2">
          <Input
            aria-label="Player ID"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="#XXXXXX"
            autoCapitalize="characters"
            className="font-display tracking-[0.2em] uppercase"
          />
          <Button type="submit" variant="secondary" disabled={busy || code.trim() === ''}>
            Find
          </Button>
        </form>
        {notFound ? (
          <p role="alert" className="text-sm text-blood">
            No player with that ID
          </p>
        ) : null}
        {card ? (
          <div className="grid gap-3 rounded-md bg-surface-2 p-3">
            <div className="flex items-center gap-3">
              <InitialsAvatar name={card.displayName} />
              <div>
                <p className="font-semibold">{card.displayName}</p>
                <p className="text-sm text-muted">
                  {card.ign ?? 'No IGN'} · {formatKey(card.playerCode, 'PLAYER_CODE')}
                </p>
              </div>
            </div>
            <RoleChoice value={role} onChange={setRole} name="request-role" />
            {role ? (
              <label className="flex items-center gap-2 text-sm">
                {role === 'LEADER' ? 'Purse' : 'Base price'}
                <Input
                  type="number"
                  min={0}
                  value={amount}
                  placeholder={String(role === 'LEADER' ? defaultPurse : minBasePrice)}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-24"
                />
                MP
              </label>
            ) : null}
            <Button type="button" disabled={!role || busy} onClick={send}>
              <Send aria-hidden /> Send request
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
