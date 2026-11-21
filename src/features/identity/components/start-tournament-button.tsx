'use client';

import { Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '../lib/api';
import { ConfirmByNameDialog } from './confirm-by-name-dialog';

/** START TOURNAMENT (§7.2 step 5): type the tournament name to confirm. */
export function StartTournamentButton({
  tournamentId,
  tournamentName,
  ready,
}: {
  tournamentId: string;
  tournamentName: string;
  ready: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="xl" disabled={!ready} onClick={() => setOpen(true)}>
        <Rocket aria-hidden /> Start tournament
      </Button>
      {!ready ? (
        <p className="text-center text-sm text-muted">Fix every ❌ check to enable Start.</p>
      ) : null}
      <ConfirmByNameDialog
        open={open}
        onOpenChange={setOpen}
        title="Start the tournament?"
        description="This locks rules, purses, base prices and teams, closes registration, and cancels pending requests."
        tournamentName={tournamentName}
        confirmLabel="Start tournament"
        onConfirm={async (confirmName) => {
          await api(`/api/tournaments/${tournamentId}/start`, { body: { confirmName } });
          toast.success('Tournament started — the auction is on!');
          router.push(`/t/${tournamentId}/auction`);
        }}
      />
    </>
  );
}
