import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AllocationPreview } from '@/server/services/allocation/allocation';
import { AllocationScreen } from './allocation-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const team = (teamId: string, name: string, squadSize: number) => ({
  teamId,
  leaderId: `l-${teamId}`,
  name,
  shortName: name.slice(0, 3).toUpperCase(),
  color: '#336699',
  sortOrder: 0,
  purseTotal: 50,
  purseRemaining: 10,
  squadSize,
  squadSizeAfter: squadSize + 1,
});

function preview(overrides: Partial<AllocationPreview> = {}): AllocationPreview {
  return {
    status: 'ALLOCATION',
    leftovers: [{ playerId: 'p1', name: 'Ravi', ign: null, photoUrl: null, basePrice: 3 }],
    steps: [
      {
        step: 1,
        playerId: 'p1',
        teamId: 'a',
        reason: 'Fewest players: 2',
        playerName: 'Ravi',
        basePrice: 3,
        teamName: 'Alpha',
        teamShortName: 'ALP',
        teamColor: '#336699',
      },
    ],
    unplaced: [],
    teams: [team('a', 'Alpha', 2), team('b', 'Bravo', 3)],
    minPlayersPerTeam: 2,
    maxPlayersPerTeam: 4,
    belowMinimum: [],
    ...overrides,
  };
}

describe('AllocationScreen', () => {
  it('shows the leftover count, the plan and its reason', () => {
    render(<AllocationScreen tournamentId="t1" preview={preview()} canConfirm />);
    expect(screen.getByText('Leftover soldiers: 1')).toBeInTheDocument();
    expect(screen.getAllByText('Fewest players: 2').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /confirm allocation/i })).toBeEnabled();
  });

  it('reveals every pick with "Show all"', async () => {
    render(<AllocationScreen tournamentId="t1" preview={preview()} canConfirm />);
    await userEvent.click(screen.getByRole('button', { name: /show all/i }));
    expect(screen.getByRole('region', { name: /allocation reveal/i })).toHaveTextContent('Ravi');
  });

  it('blocks confirm when a squad would stay below the minimum', () => {
    render(
      <AllocationScreen
        tournamentId="t1"
        preview={preview({ teams: [team('a', 'Alpha', 0), team('b', 'Bravo', 3)] })}
        canConfirm
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Alpha would stay below 2 players');
    expect(screen.getByRole('button', { name: /confirm allocation/i })).toBeDisabled();
  });

  it('hides confirm for auctioneers and shows the done state after allocation', () => {
    const { unmount } = render(
      <AllocationScreen tournamentId="t1" preview={preview()} canConfirm={false} />,
    );
    expect(screen.queryByRole('button', { name: /confirm allocation/i })).toBeNull();
    unmount();
    render(
      <AllocationScreen tournamentId="t1" preview={preview({ status: 'GROUP_DRAW' })} canConfirm />,
    );
    expect(screen.getByText('Allocation complete')).toBeInTheDocument();
  });
});
