'use client';

import { Button } from '@/components/ui/button';

/** START TOURNAMENT (§7.2 step 5). The confirmation + Start transaction land in A9. */
export function StartTournamentButton({
  ready,
}: {
  tournamentId: string;
  tournamentName: string;
  ready: boolean;
}) {
  return (
    <Button type="button" size="xl" disabled={!ready}>
      Start tournament
    </Button>
  );
}
