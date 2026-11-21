import { render, screen } from '@testing-library/react';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import {
  P1,
  P2,
  P3,
  TEAM_B,
  fakeAuction,
  snap,
  team,
  type FakeAuction,
} from '../captain/test-fixtures';
import { SoldierAuctionView, SoldierStatusCard } from './soldier-status-card';

const h = vi.hoisted(() => ({ auction: null as FakeAuction | null }));

vi.mock('../shared/auction-context', () => ({
  useAuction: () => {
    if (!h.auction) throw new Error('no auction');
    return h.auction;
  },
}));

const card = () => screen.getByRole('region', { name: 'My auction status' });

function renderCard(snapshot: AuctionSnapshot, playerId: string) {
  h.auction = fakeAuction({ snapshot });
  return render(<SoldierStatusCard playerId={playerId} />);
}

/** Move P3 into Bravo's squad, acquired the given way. */
function drafted(acquiredVia: 'AUCTION' | 'AUTO_ALLOCATED' | 'RANDOM_SQUAD' | 'ADMIN_PICK') {
  const s = snap();
  return {
    ...s,
    pool: s.pool.filter((p) => p.id !== P3),
    teams: [
      s.teams[0]!,
      team({
        ...s.teams[1]!,
        id: TEAM_B,
        name: 'Red Rhinos',
        shortName: 'RRH',
        squadSize: 3,
        members: [
          ...s.teams[1]!.members,
          {
            playerId: P3,
            name: 'Three',
            ign: null,
            photoUrl: null,
            price: acquiredVia === 'AUCTION' ? 12 : 0,
            acquiredVia,
          },
        ],
      }),
    ],
  };
}

describe('SoldierStatusCard', () => {
  it('live: on the block with the current bid and leading team', () => {
    const s = snap();
    renderCard(
      {
        ...s,
        teams: [s.teams[0]!, { ...s.teams[1]!, name: 'Red Rhinos' }],
        current: s.current && { ...s.current, currentBid: 8 },
      },
      P1,
    );
    expect(card()).toHaveTextContent("You're on the block!");
    expect(card()).toHaveTextContent('Current bid 8 MP (Red Rhinos)');
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('live with no bids yet shows the opening bid', () => {
    const s = snap();
    renderCard(
      {
        ...s,
        current: s.current && { ...s.current, currentBid: null, currentTeamId: null, nextBid: 2 },
      },
      P1,
    );
    expect(card()).toHaveTextContent('Opening bid 2 MP · no bids yet');
  });

  it('sold: drafted to the team for the price, with the squad', () => {
    renderCard(drafted('AUCTION'), P3);
    expect(card()).toHaveTextContent('You have been drafted to Red Rhinos (12 MP)');
    expect(card()).toHaveTextContent('Captain Cap Bravo');
    expect(card()).toHaveTextContent('Three');
  });

  it('auto-allocated, random draw and admin pick each have their own line', () => {
    const { unmount } = renderCard(drafted('AUTO_ALLOCATED'), P3);
    expect(card()).toHaveTextContent('Auto-assigned to Red Rhinos');
    unmount();
    const r = renderCard(drafted('RANDOM_SQUAD'), P3);
    expect(card()).toHaveTextContent('Sent to Red Rhinos by random draw');
    r.unmount();
    renderCard(drafted('ADMIN_PICK'), P3);
    expect(card()).toHaveTextContent('Picked for Red Rhinos by the organisers');
  });

  it('unsold: on the unsold list', () => {
    renderCard(snap(), P2);
    expect(card()).toHaveTextContent(
      'You are on the unsold list for now. The admin can still put you in a squad, so stay tuned.',
    );
  });

  it('pool: waiting with the base price', () => {
    renderCard(snap(), P3);
    expect(card()).toHaveTextContent('In the waiting pool · base price 5 MP');
  });

  it('not in the lists yet', () => {
    renderCard(snap(), 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    expect(card()).toHaveTextContent('Your auction status shows here');
  });
});

describe('SoldierAuctionView', () => {
  it('shows the card, the live lot and every squad', () => {
    h.auction = fakeAuction({ snapshot: snap() });
    render(<SoldierAuctionView playerId={P3} />);
    expect(card()).toHaveTextContent('In the waiting pool');
    expect(screen.getByRole('heading', { name: 'One' })).toBeInTheDocument();
    expect(screen.getByText('In-game: uno')).toBeInTheDocument();
    expect(screen.getByText(/Bravo \(BRV\) leads/)).toBeInTheDocument();
    expect(screen.getByText('Captain Cap Alpha')).toBeInTheDocument();
    expect(screen.getByText('Captain Cap Bravo')).toBeInTheDocument();
    // read-only: no bid controls
    expect(screen.queryByRole('button', { name: /bid/i })).not.toBeInTheDocument();
  });

  it('shows the break countdown between lots', () => {
    h.auction = fakeAuction({
      snapshot: snap({ current: null, nextAt: new Date(Date.now() + 2_000).toISOString() }),
    });
    render(<SoldierAuctionView playerId={P3} />);
    expect(screen.getByText(/Next soldier in/)).toBeInTheDocument();
  });

  it('highlights my squad once drafted', () => {
    h.auction = fakeAuction({ snapshot: drafted('AUCTION') });
    render(<SoldierAuctionView playerId={P3} />);
    expect(card()).toHaveTextContent('You have been drafted to Red Rhinos');
    const squads = screen.getByRole('region', { name: 'Squads' });
    const highlighted = squads.querySelectorAll('.shadow-glow');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveTextContent('Red Rhinos');
  });
});
