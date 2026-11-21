import { render, screen, within } from '@testing-library/react';
import type { StandingRow } from '@/lib/rules/computeStandings';
import type { TeamView } from '../types';
import { ceremonySteps } from './draw-ceremony';
import { StandingsTable } from './standings-table';

const team = (id: string, name: string, shortName: string): TeamView => ({
  id,
  name,
  shortName,
  color: '#1e88e5',
  emoji: null,
  logoUrl: null,
  motto: null,
  captainName: 'Cap',
  spent: 0,
  purseTotal: 50,
  purseRemaining: 50,
  sortOrder: 0,
});

const row = (teamId: string, position: number, over: Partial<StandingRow> = {}): StandingRow => ({
  teamId,
  position,
  played: 2,
  won: 2 - Math.min(position - 1, 2),
  lost: Math.min(position - 1, 2),
  gamesWon: 0,
  gamesLost: 0,
  gameDiff: 3 - position,
  killsFor: 40,
  killsAgainst: 30,
  killDiff: 10,
  points: 9 - position * 3,
  form: ['W', 'L'],
  needsDraw: false,
  ...over,
});

const teams = new Map([
  ['a', team('a', 'Red Rhinos', 'RHN')],
  ['b', team('b', 'Blue Hawks', 'HWK')],
  ['c', team('c', 'Green Vipers', 'VIP')],
]);

describe('StandingsTable', () => {
  it('marks qualifying places, shows the team name next to its colour and flags draws', () => {
    render(
      <StandingsTable
        rows={[row('a', 1), row('b', 2), row('c', 3, { needsDraw: true })]}
        teams={teams}
        advance={2}
        myTeamId="b"
      />,
    );
    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(3);
    expect(within(bodyRows[0]!).getByTitle('Qualifying place')).toBeInTheDocument();
    expect(within(bodyRows[1]!).getByTitle('Qualifying place')).toBeInTheDocument();
    expect(within(bodyRows[2]!).queryByTitle('Qualifying place')).toBeNull();
    // Colour is never the only signal: short code and name are both there.
    expect(within(bodyRows[0]!).getByText('RHN')).toBeInTheDocument();
    expect(within(bodyRows[0]!).getByText('Red Rhinos')).toBeInTheDocument();
    expect(within(bodyRows[2]!).getByText('Draw needed')).toBeInTheDocument();
    expect(within(bodyRows[0]!).getByLabelText('Form: W L')).toBeInTheDocument();
  });

  it('compact mode keeps only position, team, played and points', () => {
    render(<StandingsTable rows={[row('a', 1)]} teams={teams} advance={1} compact />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      '#',
      'Team',
      'P',
      'Pts',
    ]);
  });
});

describe('ceremonySteps', () => {
  it('reveals pot by pot across groups, or group by group for a manual placement', () => {
    const drawn = [
      {
        teams: [
          { teamId: 'a1', pot: 1 },
          { teamId: 'a2', pot: 2 },
        ],
      },
      {
        teams: [
          { teamId: 'b1', pot: 1 },
          { teamId: 'b2', pot: 2 },
        ],
      },
    ];
    expect(ceremonySteps(drawn).map((s) => s.teamId)).toEqual(['a1', 'b1', 'a2', 'b2']);
    const manual = [
      {
        teams: [
          { teamId: 'x', pot: null },
          { teamId: 'y', pot: null },
        ],
      },
      { teams: [{ teamId: 'z', pot: null }] },
    ];
    expect(ceremonySteps(manual).map((s) => [s.groupIndex, s.teamId])).toEqual([
      [0, 'x'],
      [0, 'y'],
      [1, 'z'],
    ]);
  });
});
