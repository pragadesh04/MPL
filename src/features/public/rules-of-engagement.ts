import type { FormatPlan } from '@/lib/rules/planFormat';
import type { TournamentSettings } from '@/lib/schemas/settings';

/**
 * "Rules of engagement" cards for the tournament home (PLAN §7): generated from the real settings,
 * never hand-written, so they always match what the server enforces.
 */
export interface RuleCard {
  id: 'purse' | 'squad' | 'opening' | 'raise' | 'timer' | 'unsold' | 'format';
  title: string;
  /** Big headline value, e.g. "50 MP". */
  value: string;
  detail: string;
}

const ORDER_TEXT: Record<TournamentSettings['playerOrder'], string> = {
  random: 'in random order',
  byBasePriceDesc: 'highest base price first',
  manualQueue: 'in the organisers’ order',
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function raiseText(s: Pick<TournamentSettings, 'bidIncrements' | 'allowCustomBids'>): {
  value: string;
  detail: string;
} {
  const custom = s.allowCustomBids
    ? 'Captains may bid more than the minimum raise.'
    : 'Every bid goes up by exactly the minimum raise.';
  if (s.bidIncrements.type === 'flat') {
    return {
      value: `+${s.bidIncrements.step} MP`,
      detail: `Minimum raise on the current bid. ${custom}`,
    };
  }
  const bands = s.bidIncrements.bands;
  const parts = bands.map((b, i) => {
    const next = bands[i + 1];
    return next ? `+${b.step} from ${b.from} to ${next.from - 1}` : `+${b.step} from ${b.from} up`;
  });
  return { value: 'By price band', detail: `Minimum raise: ${parts.join(', ')} MP. ${custom}` };
}

export function unsoldText(
  s: Pick<TournamentSettings, 'unsoldPolicy' | 'unsoldReauctionRounds' | 'reauctionPricePercent'>,
): { value: string; detail: string } {
  switch (s.unsoldPolicy) {
    case 'REAUCTION_THEN_ALLOCATE': {
      const allocate =
        'then any still unsold go free (0 MP) to the team with the fewest players (tie: lowest MP left, then team order).';
      return s.unsoldReauctionRounds === 0
        ? { value: 'Auto-allocated', detail: `Nobody bids? The soldier is unsold; ${allocate}` }
        : {
            value: 'Re-auction',
            detail: `Nobody bids? The soldier comes back in ${plural(s.unsoldReauctionRounds, 're-auction round')} at ${s.reauctionPricePercent}% of the base price, ${allocate}`,
          };
    }
    case 'RANDOM_SQUAD':
      return {
        value: 'Random squad',
        detail: 'Nobody bids? The soldier joins a random squad with space, for free.',
      };
    case 'ADMIN_DECIDES':
      return {
        value: 'Organisers decide',
        detail:
          'Nobody bids? The soldier waits on the unsold list until an organiser assigns them.',
      };
  }
}

export function rulesOfEngagement(s: TournamentSettings, plan: FormatPlan): RuleCard[] {
  const timer =
    s.timerResetSeconds >= s.bidTimerSeconds
      ? 'Every bid restarts the clock.'
      : `Each bid puts the clock back to at least ${s.timerResetSeconds}s.`;
  const raise = raiseText(s);
  const unsold = unsoldText(s);
  const bestOf = `Group matches best of ${s.groupMatchBestOf}, knockout best of ${s.knockoutBestOf}, final best of ${s.finalBestOf}.`;
  return [
    {
      id: 'purse',
      title: 'Purse',
      value: `${s.defaultPurse} MP`,
      detail:
        'Militia Points for each captain to spend in the auction (organisers can set it per captain).',
    },
    {
      id: 'squad',
      title: 'Squad size',
      value:
        s.minPlayersPerTeam === s.maxPlayersPerTeam
          ? `${s.maxPlayersPerTeam}`
          : `${s.minPlayersPerTeam}–${s.maxPlayersPerTeam}`,
      detail: `Players per team, captain included. A full squad (${s.maxPlayersPerTeam}) can’t bid.`,
    },
    {
      id: 'opening',
      title: 'Opening bid',
      value: `${s.minBasePrice} MP`,
      detail: `No soldier’s base price is lower. Soldiers go under the hammer ${ORDER_TEXT[s.playerOrder]}.`,
    },
    { id: 'raise', title: 'Raise', ...raise },
    {
      id: 'timer',
      title: 'Timer',
      value: `${s.bidTimerSeconds}s`,
      detail: `${timer} ${s.breakSeconds > 0 ? `${s.breakSeconds}s break, then the next soldier opens automatically.` : 'The next soldier opens straight away.'}`,
    },
    { id: 'unsold', title: 'When nobody bids', ...unsold },
    {
      id: 'format',
      title: 'Format',
      value:
        plan.kind === 'FINAL_ONLY'
          ? 'Final'
          : plan.kind === 'SINGLE_GROUP'
            ? 'League + final'
            : 'Groups + knockout',
      detail:
        `${plan.summary} ${plan.totalMatches > 0 ? `${bestOf} ${s.pointsForWin} points per win; no draws: a tied game is replayed.` : ''}`.trim(),
    },
  ];
}
