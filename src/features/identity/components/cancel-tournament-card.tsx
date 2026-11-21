'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '../lib/api';
import { ConfirmByNameDialog } from './confirm-by-name-dialog';

/** Danger zone: cancel the tournament (owner, any state before COMPLETED, §1). */
export function CancelTournamentCard({
  tournamentId,
  tournamentName,
}: {
  tournamentId: string;
  tournamentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-blood/40">
      <CardHeader>
        <CardTitle className="text-blood">Cancel tournament</CardTitle>
        <CardDescription>
          It becomes a read-only archive and you can create a new tournament. Pending requests are
          cancelled.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
          Cancel tournament
        </Button>
      </CardContent>
      <ConfirmByNameDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this tournament?"
        description="Everything stays viewable, but nothing can change any more."
        tournamentName={tournamentName}
        confirmLabel="Cancel tournament"
        destructive
        onConfirm={async (confirmName) => {
          await api(`/api/tournaments/${tournamentId}/cancel`, { body: { confirmName } });
          toast.success('Tournament cancelled');
          router.push('/dashboard');
          router.refresh();
        }}
      />
    </Card>
  );
}
