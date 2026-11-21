import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  P1,
  P3,
  TEAM_A,
  TEAM_B,
  fakeAuction,
  lobbySnap,
  snap,
  team,
  type FakeAuction,
} from '../captain/test-fixtures';
import { BigScreenAuction } from './big-screen-auction';
import { lastSales, purseLeaderboard, topBuy } from './sales';

const h = vi.hoisted(() => ({
  auction: null as FakeAuction | null,
  playSound: vi.fn(),
  celebrateSale: vi.fn(),
}));

vi.mock('../shared/auction-context', () => ({
  useAuction: () => {
    if (!h.auction) throw new Error('no auction');
    return h.auction;
  },
}));
vi.mock('../shared/effects', () => ({
  haptic: vi.fn(),
  playSound: h.playSound,
  celebrateSale: h.celebrateSale,
}));

function renderScreen(o: Partial<FakeAuction> = {}) {
  h.auction = fakeAuction(o);
  return render(<BigScreenAuction />);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('BigScreenAuction', () => {
  it('shows the lot with the bid and leading team while a soldier is on the block', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: "Ravi's MPL" })).toBeInTheDocument();
    expect(screen.getByText('Bidding open')).toBeInTheDocument();
    const lot = screen.getByRole('region', { name: 'Soldier on the block' });
    expect(within(lot).getByRole('heading', { name: 'One' })).toBeInTheDocument();
    expect(within(lot).getByText('In-game: uno')).toBeInTheDocument();
    expect(within(lot).getByText('Current bid 4 MP')).toBeInTheDocument();
    expect(within(lot).getByText('Bravo (BRV) leads')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Squads' })).not.toBeInTheDocument();
  });

  it('shows the squads grid when idle (lobby)', () => {
    renderScreen({ snapshot: lobbySnap() });
    expect(screen.queryByRole('region', { name: 'Soldier on the block' })).not.toBeInTheDocument();
    const squads = screen.getByRole('region', { name: 'Squads' });
    expect(
      within(squads).getByRole('heading', { name: 'Auction starts soon' }),
    ).toBeInTheDocument();
    expect(within(squads).getByText('Captain Cap Alpha')).toBeInTheDocument();
    expect(within(squads).getByText('Niner')).toBeInTheDocument();
  });

  it('hide purses removes MP left from the squads and the ticker', async () => {
    const user = userEvent.setup();
    renderScreen({ snapshot: lobbySnap() });
    const squads = screen.getByRole('region', { name: 'Squads' });
    expect(within(squads).getAllByText('MP left')).toHaveLength(2);
    const ticker = screen.getByRole('region', { name: 'MP left' });
    expect(within(ticker).queryByText('Purses hidden')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Hide purses' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(within(squads).queryByText('MP left')).not.toBeInTheDocument();
    expect(within(ticker).getByText('Purses hidden')).toBeInTheDocument();
  });

  it('toggles sound and plays a confirmation when turned on', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('mpl:sound', 'off');
    renderScreen({ snapshot: lobbySnap() });
    await user.click(screen.getByRole('button', { name: 'Sound off' }));
    expect(window.localStorage.getItem('mpl:sound')).toBe('on');
    expect(screen.getByRole('button', { name: 'Sound on' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(h.playSound).toHaveBeenCalledWith('open');
  });

  it('stamps SOLD with confetti and the gavel when a lot closes', async () => {
    const { rerender } = renderScreen();
    const sold = snap({
      current: null,
      nextAt: new Date(Date.now() + 2_000).toISOString(),
      lastResult: { playerId: P1, result: 'SOLD', teamId: TEAM_B, price: 4, reason: null },
    });
    h.auction = fakeAuction({ snapshot: sold });
    rerender(<BigScreenAuction />);
    // the lot card exits first (AnimatePresence mode="wait")
    const stage = await screen.findByRole('region', { name: 'Sold' }, { timeout: 3_000 });
    expect(within(stage).getAllByText(/Sold/i).length).toBeGreaterThan(0);
    expect(within(stage).getByText('Bravo (BRV)')).toBeInTheDocument();
    expect(h.celebrateSale).toHaveBeenCalledWith('#00ff00', { big: true });
    expect(h.playSound).toHaveBeenCalledWith('gavel');
    expect(screen.getByText(/Next soldier in/)).toBeInTheDocument();
  });

  it('stamps UNSOLD in grey without confetti', async () => {
    const { rerender } = renderScreen();
    h.auction = fakeAuction({
      snapshot: snap({
        current: null,
        nextAt: new Date(Date.now() + 2_000).toISOString(),
        lastResult: {
          playerId: P1,
          result: 'UNSOLD',
          teamId: null,
          price: null,
          reason: 'NO_BIDS',
        },
      }),
    });
    rerender(<BigScreenAuction />);
    const stage = await screen.findByRole('region', { name: 'Unsold' }, { timeout: 3_000 });
    expect(within(stage).getByText('No bids')).toBeInTheDocument();
    expect(h.celebrateSale).not.toHaveBeenCalled();
    expect(h.playSound).toHaveBeenCalledWith('unsold');
  });

  it('does not replay the stamp for the result already there on load', () => {
    renderScreen({
      snapshot: snap({
        current: null,
        lastResult: { playerId: P1, result: 'SOLD', teamId: TEAM_B, price: 4, reason: null },
      }),
    });
    expect(screen.queryByRole('region', { name: 'Sold' })).not.toBeInTheDocument();
    expect(h.celebrateSale).not.toHaveBeenCalled();
  });

  it('shows the auction complete idle screen', () => {
    renderScreen({ snapshot: snap({ current: null, status: 'ALLOCATION' }) });
    expect(screen.getByRole('heading', { name: 'Auction complete' })).toBeInTheDocument();
  });
});

describe('big-screen ticker data', () => {
  const s = snap({
    teams: [
      team({
        purseRemaining: 30,
        members: [
          {
            playerId: P3,
            name: 'Three',
            ign: null,
            photoUrl: null,
            price: 20,
            acquiredVia: 'AUCTION',
          },
          {
            playerId: 'x',
            name: 'Auto',
            ign: null,
            photoUrl: null,
            price: 0,
            acquiredVia: 'AUTO_ALLOCATED',
          },
        ],
      }),
      team({
        id: TEAM_B,
        name: 'Bravo',
        shortName: 'BRV',
        sortOrder: 1,
        purseRemaining: 46,
        members: [
          {
            playerId: P1,
            name: 'One',
            ign: null,
            photoUrl: null,
            price: 4,
            acquiredVia: 'AUCTION',
          },
        ],
      }),
    ],
    recentBids: [
      {
        id: 7,
        playerId: P1,
        teamId: TEAM_B,
        amount: 4,
        isFallback: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 3,
        playerId: P3,
        teamId: TEAM_A,
        amount: 20,
        isFallback: false,
        createdAt: new Date().toISOString(),
      },
    ],
  });

  it('orders sales by the winning bid, newest first, and skips allocations', () => {
    expect(lastSales(s).map((x) => x.name)).toEqual(['One', 'Three']);
  });

  it('finds the most expensive buy', () => {
    expect(topBuy(s)?.name).toBe('Three');
  });

  it('ranks teams by MP left', () => {
    expect(purseLeaderboard(s).map((t) => t.name)).toEqual(['Bravo', 'Alpha']);
  });
});
