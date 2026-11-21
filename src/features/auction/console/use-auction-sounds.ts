'use client';

import { useEffect, useRef } from 'react';
import { useSoundEnabled } from '@/lib/sound';
import { useAuction } from '../shared/auction-context';
import { celebrateSale, playSound } from '../shared/effects';

/**
 * Console sounds from applied auction events (§7.6): `open` on lot.opened, `bid` on bid.placed,
 * `gavel` on a sale and `unsold` otherwise. Sounds play only when the sound toggle is on; the
 * sale confetti (in the buying team's colour) is visual and respects reduced motion itself.
 */
export function useAuctionSounds(): void {
  const { onEvent, snapshot } = useAuction();
  const sound = useSoundEnabled();
  const soundRef = useRef(sound);
  const teamsRef = useRef(snapshot.teams);
  useEffect(() => {
    soundRef.current = sound;
    teamsRef.current = snapshot.teams;
  });

  useEffect(
    () =>
      onEvent((e) => {
        const play = soundRef.current;
        switch (e.type) {
          case 'lot.opened':
            if (play) playSound('open');
            return;
          case 'bid.placed':
            if (play) playSound('bid');
            return;
          case 'lot.closed': {
            if (e.data.result === 'SOLD') {
              if (play) playSound('gavel');
              const team = teamsRef.current.find((t) => t.id === e.data.teamId);
              if (team) celebrateSale(team.color);
            } else if (play) {
              playSound('unsold');
            }
            return;
          }
          default:
            return;
        }
      }),
    [onEvent],
  );
}
