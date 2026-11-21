import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import type { RosterPerson } from '../shared/types';
import { makeAuction, makeSnapshot, makeViewer, player, team } from '../console/test-fixtures';
import { CommandPost } from './command-post';

let auction = makeAuction(makeSnapshot());

vi.mock('../shared/auction-context', () => ({ useAuction: () => auction }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/app/(app)/t/[id]/command-post/actions', () => ({ saveLiveRules: vi.fn() }));

const person = (o: Partial<RosterPerson> & Pick<RosterPerson, 'id' | 'name'>): RosterPerson => ({
  kind: 'SOLDIER',
  ign: null,
  username: null,
  photoUrl: null,
  teamId: null,
  status: 'POOL',
  price: null,
  acquiredVia: null,
  ...o,
});

// The roster prop is stale on purpose (everyone "POOL"); status must come from the snapshot.
const roster: RosterPerson[] = [
  person({ kind: 'CAPTAIN', id: 'la', name: 'Arjun', teamId: 'a', status: 'CAPTAIN' }),
  person({ id: 'p1', name: 'Ghost', ign: 'gh0st', username: 'ghosty' }),
  person({ id: 'p2', name: 'Viper' }),
  person({ id: 'p3', name: 'Echo' }),
  person({ id: 'p4', name: 'Nova' }),
  person({ id: 'p5', name: 'Blaze' }),
];

function liveSnapshot(): AuctionSnapshot {
  return makeSnapshot({
    teams: [
      team('a', 'Red Rhinos', {
        purseRemaining: 29,
        squadSize: 3,
        members: [
          {
            playerId: 'p4',
            name: 'Nova',
            ign: null,
            photoUrl: null,
            price: 21,
            acquiredVia: 'AUCTION',
          },
          {
            playerId: 'p5',
            name: 'Blaze',
            ign: null,
            photoUrl: null,
            price: 0,
            acquiredVia: 'ADMIN_PICK',
          },
        ],
      }),
      team('b', 'Bravo', { sortOrder: 1 }),
    ],
    pool: [player('p1', 'Ghost', { status: 'ON_BLOCK' }), player('p2', 'Viper')],
    unsold: [player('p3', 'Echo', { status: 'UNSOLD' })],
  });
}

function setup(viewer = makeViewer()) {
  auction = makeAuction(liveSnapshot());
  const user = userEvent.setup();
  render(<CommandPost viewer={viewer} roster={roster} />);
  const table = screen.getByRole('table');
  const row = (name: string): HTMLElement => {
    const tr = within(table).getByText(name).closest('tr');
    if (!tr) throw new Error(`No row for ${name}`);
    return tr;
  };
  return { user, auction, table, row };
}

describe('CommandPost · registered table', () => {
  it('derives squad / status from the live snapshot, not the roster prop', () => {
    const { row } = setup();
    expect(screen.getByText('Registered (6)')).toBeInTheDocument();
    expect(within(row('Arjun')).getByText('(29 MP left)')).toBeInTheDocument();
    expect(within(row('Ghost')).getByText('On the block')).toBeInTheDocument();
    expect(within(row('Viper')).getByText('In pool')).toBeInTheDocument();
    expect(within(row('Echo')).getByText('Unsold')).toBeInTheDocument();
    expect(within(row('Nova')).getByText('(21 MP)')).toBeInTheDocument();
    expect(within(row('Blaze')).getByText('Admin pick')).toBeInTheDocument();
    expect(within(row('Ghost')).getByText('gh0st · @ghosty')).toBeInTheDocument();
  });

  it('searches by name, IGN or username', async () => {
    const { user, table } = setup();
    await user.type(screen.getByRole('searchbox', { name: 'Search the roster' }), 'ghosty');
    expect(within(table).getByText('Ghost')).toBeInTheDocument();
    expect(within(table).queryByText('Viper')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(within(table).getByText('No one matches.')).toBeInTheDocument();
  });

  it('filters captains and soldiers', async () => {
    const { user, table } = setup();
    await user.click(screen.getByRole('button', { name: 'Captains' }));
    expect(screen.getByRole('button', { name: 'Captains' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(table).getByText('Arjun')).toBeInTheDocument();
    expect(within(table).queryByText('Viper')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Soldiers' }));
    expect(within(table).queryByText('Arjun')).not.toBeInTheDocument();
    expect(within(table).getByText('Viper')).toBeInTheDocument();
  });

  it('releases a squad soldier after confirming, with the optional reason', async () => {
    const { user, auction, row } = setup();
    expect(within(row('Viper')).queryByRole('button', { name: /Release/ })).not.toBeInTheDocument();
    await user.click(within(row('Nova')).getByRole('button', { name: 'Release Nova' }));
    const dialog = await screen.findByRole('dialog', { name: 'Release Nova' });
    expect(within(dialog).getByText(/Red Rhinos gets 21 MP back/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason (optional)'), 'Left the clan');
    await user.click(within(dialog).getByRole('button', { name: 'Release soldier' }));
    expect(auction.command).toHaveBeenCalledWith({
      type: 'release',
      playerId: 'p4',
      reason: 'Left the clan',
    });
  });

  it('sends no reason when it is left empty', async () => {
    const { user, auction, row } = setup();
    await user.click(within(row('Nova')).getByRole('button', { name: 'Release Nova' }));
    const dialog = await screen.findByRole('dialog', { name: 'Release Nova' });
    await user.click(within(dialog).getByRole('button', { name: 'Release soldier' }));
    expect(auction.command).toHaveBeenCalledWith({ type: 'release', playerId: 'p4' });
  });

  it('hides Release without the roster permission', () => {
    const { row } = setup(makeViewer({ canRoster: false, roles: ['AUCTIONEER'] }));
    expect(within(row('Nova')).queryByRole('button', { name: /Release/ })).not.toBeInTheDocument();
  });

  it('links to the auction room and renders a squad card per team', () => {
    setup();
    expect(screen.getByRole('link', { name: /Auction room/ })).toHaveAttribute(
      'href',
      '/t/t1/auction',
    );
    const squads = screen.getByRole('region', { name: 'Squads' });
    expect(within(squads).getByText('Red Rhinos')).toBeInTheDocument();
    expect(within(squads).getByText('Bravo')).toBeInTheDocument();
    expect(within(squads).getByText('Nova')).toBeInTheDocument();
  });
});
