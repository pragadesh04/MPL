'use client';

import { KeyRound, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ParticipantKind } from '@/lib/schemas/enums';
import { api, errorMessage } from '../lib/api';
import { formatKeyInput, useOrganiserKeyPreview } from '../lib/hooks';
import { firstName } from '../lib/labels';
import { RoleChoice } from './role-choice';

interface JoinResponse {
  joined: boolean;
  message?: string;
  tournamentName?: string;
  organiserName: string;
}

/** "Join with a key" for existing accounts (§2.3 B, §7.1). Always visible on the dashboard. */
export function JoinWithKeyCard({ initialKey = '' }: { initialKey?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(formatKeyInput(initialKey));
  const [role, setRole] = useState<ParticipantKind | undefined>();
  const [busy, setBusy] = useState(false);
  const lookup = useOrganiserKeyPreview(value);

  const join = async (): Promise<void> => {
    if (lookup.state !== 'found' || !role) return;
    setBusy(true);
    try {
      const res = await api<JoinResponse>(`/api/organiser-keys/${lookup.key}/join`, {
        body: { role },
      });
      if (res.joined) {
        toast.success(
          `You signed up for ${res.tournamentName}. ${firstName(res.organiserName)} will approve you.`,
        );
        setValue('');
        setRole(undefined);
        router.refresh();
      } else {
        toast.error(res.message ?? 'That tournament isn’t taking sign-ups right now');
      }
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
          <KeyRound aria-hidden className="size-5 text-lime" /> Join with a key
        </CardTitle>
        <CardDescription>
          Got an organiser key? Enter it to sign up for their tournament.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Input
          aria-label="Organiser key"
          value={value}
          onChange={(e) => setValue(formatKeyInput(e.target.value))}
          placeholder="XXX-XXX"
          autoCapitalize="characters"
          className="font-display text-lg tracking-[0.3em] uppercase"
        />
        {lookup.state === 'checking' ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Looking up the key…
          </p>
        ) : lookup.state === 'invalid' ? (
          <p role="alert" className="text-sm text-blood">
            We couldn’t find that key. Check it with your organiser.
          </p>
        ) : lookup.state === 'found' ? (
          lookup.preview.canJoin ? (
            <div className="grid gap-3">
              <p>
                You&apos;re joining{' '}
                <strong className="text-lime">{lookup.preview.tournamentName}</strong> by{' '}
                {lookup.preview.organiserName}
              </p>
              <RoleChoice value={role} onChange={setRole} name="join-role" />
              <Button type="button" disabled={!role || busy} onClick={join}>
                {role === 'LEADER'
                  ? `Enlist as captain under ${firstName(lookup.preview.organiserName)}`
                  : role === 'PLAYER'
                    ? `Enlist as soldier under ${firstName(lookup.preview.organiserName)}`
                    : 'Pick captain or soldier'}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-amber">{lookup.preview.message}</p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
