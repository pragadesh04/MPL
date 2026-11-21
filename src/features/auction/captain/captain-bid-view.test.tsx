import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuctionEnvelope } from '@/lib/schemas/realtime';
import type { AuctionViewer } from '../shared/types';
import { CaptainBidView } from './captain-bid-view';
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
} from './test-fixtures';

const h = vi.hoisted(() => ({
  auction: null as FakeAuction | null,
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
  haptic: vi.fn(),
  playSound: vi.fn(),
}));

vi.mock('../shared/auction-context', () => ({
  useAuction: () => {
    if (!h.auction) throw new Error('no auction');
    return h.auction;
  },
}));
vi.mock('@/components/ui/sonner', () => ({ toast: h.toast }));
vi.mock('../shared/effects', () => ({
  haptic: h.haptic,
  playSound: h.playSound,
  celebrateSale: vi.fn(),
}));

const viewer: AuctionViewer = {
  userId: 'user-a',
  roles: ['CAPTAIN'],
  teamId: TEAM_A,
  playerId: null,
  canControl: false,
  canRoster: false,
  canReset: false,
  canEditLiveSettings: false,
  isOrganiser: false,
};

function renderView(o: Partial<FakeAuction> = {}) {
  h.auction = fakeAuction(o);
  return render(<CaptainBidView viewer={viewer} teamId={TEAM_A} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('CaptainBidView', () => {
  it('shows the team header with MP left and squad size', () => {
    renderView();
    const header = screen.getByRole('banner');
    expect(within(header).getByText('Alpha')).toBeInTheDocument();
    expect(within(header).getByText(/ALP/)).toBeInTheDocument();
    expect(within(header).getByText('50')).toBeInTheDocument();
    expect(within(header).getByText('1/3')).toBeInTheDocument();
  });

  it('BID button bids the next valid amount', async () => {
    const bid = vi.fn<FakeAuction['bid']>(() =>
      Promise.resolve({ ok: true, data: { snapshot: snap() } }),
    );
    renderView({ bid });
    await userEvent.click(screen.getByRole('button', { name: 'Bid 5 MP' }));
    expect(bid).toHaveBeenCalledWith(5);
    expect(bid).toHaveBeenCalledTimes(1);
  });

  it('quick-raise chips bid their amount', async () => {
    const bid = vi.fn<FakeAuction['bid']>(() =>
      Promise.resolve({ ok: true, data: { snapshot: snap() } }),
    );
    renderView({ bid });
    await userEvent.click(screen.getByRole('button', { name: 'Quick bid 6 MP' }));
    expect(bid).toHaveBeenCalledWith(6);
  });

  it('ignores a double tap while a bid is in flight', async () => {
    let resolve: (() => void) | undefined;
    const bid = vi.fn<FakeAuction['bid']>(
      () =>
        new Promise((r) => {
          resolve = () => r({ ok: true, data: { snapshot: snap() } });
        }),
    );
    renderView({ bid });
    const button = screen.getByRole('button', { name: 'Bid 5 MP' });
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: /Bidding/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Bidding/ }));
    expect(bid).toHaveBeenCalledTimes(1);
    await act(async () => resolve?.());
    expect(screen.getByRole('button', { name: 'Bid 5 MP' })).toBeEnabled();
  });

  it('disables the button with the reason while leading, and glows', () => {
    const s = snap();
    renderView({
      snapshot: { ...s, current: s.current && { ...s.current, currentTeamId: TEAM_A } },
    });
    expect(screen.getByRole('button', { name: 'Bid 5 MP' })).toBeDisabled();
    expect(screen.getByText('You hold the highest bid. Hold steady!')).toBeInTheDocument();
    expect(screen.getByText("You're winning")).toBeInTheDocument();
  });

  it('disables the button when the squad is full', () => {
    const s = snap();
    renderView({ snapshot: { ...s, teams: [team({ squadSize: 3 }), s.teams[1]!] } });
    expect(screen.getByRole('button', { name: 'Bid 5 MP' })).toBeDisabled();
    expect(screen.getByText('Your squad is full')).toBeInTheDocument();
  });

  it('disables the button when the purse cannot cover the next bid', () => {
    const s = snap();
    renderView({ snapshot: { ...s, teams: [team({ purseRemaining: 3 }), s.teams[1]!] } });
    expect(screen.getByRole('button', { name: 'Bid 5 MP' })).toBeDisabled();
    expect(screen.getByText('Not enough points for the next bid (5)')).toBeInTheDocument();
  });

  it('asks to confirm a jump bid before sending it', async () => {
    const bid = vi.fn<FakeAuction['bid']>(() =>
      Promise.resolve({ ok: true, data: { snapshot: snap() } }),
    );
    renderView({ bid });
    await userEvent.type(screen.getByLabelText('Custom bid amount'), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Place custom bid' }));
    expect(bid).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Confirm jump bid')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, bid 20 MP' }));
    expect(bid).toHaveBeenCalledWith(20);
  });

  it('sends a small custom bid without confirmation', async () => {
    const bid = vi.fn<FakeAuction['bid']>(() =>
      Promise.resolve({ ok: true, data: { snapshot: snap() } }),
    );
    renderView({ bid });
    await userEvent.type(screen.getByLabelText('Custom bid amount'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Place custom bid' }));
    expect(bid).toHaveBeenCalledWith(7);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toasts "Someone bid first" on OUTBID and the message on other errors', async () => {
    const bid = vi
      .fn<FakeAuction['bid']>()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        error: { code: 'OUTBID', message: 'Outbid' },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        error: { code: 'CONFLICT', message: 'That soldier is no longer on the block' },
      });
    renderView({ bid });
    await userEvent.click(screen.getByRole('button', { name: 'Bid 5 MP' }));
    expect(h.toast.error).toHaveBeenCalledWith('Someone bid first', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Bid 5 MP' }));
    expect(h.toast.error).toHaveBeenCalledWith('That soldier is no longer on the block');
  });

  it('alerts when a bid.placed event takes the lead away', () => {
    let listener: ((e: AuctionEnvelope) => void) | undefined;
    const onEvent = vi.fn((l: (e: AuctionEnvelope) => void) => {
      listener = l;
      return () => undefined;
    });
    const s = snap();
    renderView({
      onEvent,
      snapshot: { ...s, current: s.current && { ...s.current, currentTeamId: TEAM_A } },
    });
    expect(listener).toBeDefined();
    act(() =>
      listener?.({
        type: 'bid.placed',
        tournamentId: 't',
        version: 4,
        serverNow: new Date().toISOString(),
        data: {
          bidId: 9,
          playerId: P1,
          teamId: TEAM_B,
          amount: 6,
          endsAt: new Date(Date.now() + 30_000).toISOString(),
          isFallback: false,
          enteredByUserId: null,
        },
      }),
    );
    expect(h.toast.warning).toHaveBeenCalledWith('Outbid!', expect.anything());
    expect(h.haptic).toHaveBeenCalled();
    expect(h.playSound).toHaveBeenCalledWith('outbid');
  });

  it('does not alert when another team outbids a third team', () => {
    let listener: ((e: AuctionEnvelope) => void) | undefined;
    renderView({
      onEvent: (l) => {
        listener = l;
        return () => undefined;
      },
    });
    act(() =>
      listener?.({
        type: 'bid.placed',
        tournamentId: 't',
        version: 4,
        serverNow: new Date().toISOString(),
        data: {
          bidId: 9,
          playerId: P1,
          teamId: TEAM_B,
          amount: 6,
          endsAt: new Date(Date.now() + 30_000).toISOString(),
          isFallback: false,
          enteredByUserId: null,
        },
      }),
    );
    expect(h.toast.warning).not.toHaveBeenCalled();
  });

  it('shows the banner and blocks bidding while offline', () => {
    renderView({ connection: 'disconnected' });
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.getByRole('button', { name: 'Bid 5 MP' })).toBeDisabled();
  });

  it('allows bidding when realtime is disabled (polling)', () => {
    renderView({ connection: 'disabled' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bid 5 MP' })).toBeEnabled();
  });

  it('shows the lobby with the captains and a connection test', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    try {
      renderView({ snapshot: lobbySnap() });
      expect(screen.getByText('Waiting for the auction to start')).toBeInTheDocument();
      expect(screen.getByText('Cap Bravo')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Test connection' }));
      await waitFor(() => expect(screen.getByText(/Latency \d+ ms/)).toBeInTheDocument());
      expect(fetchMock).toHaveBeenCalledWith('/api/health', { cache: 'no-store' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows the paused, break and complete screens', () => {
    const { unmount } = renderView({ snapshot: snap({ status: 'AUCTION_PAUSED' }) });
    expect(
      screen.getByText('The admin paused the auction. Hold your position.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bid 5 MP' })).toBeDisabled();
    unmount();

    const b = renderView({
      snapshot: snap({ current: null, nextAt: new Date(Date.now() + 2_000).toISOString() }),
    });
    expect(screen.getByText(/Next soldier in/)).toBeInTheDocument();
    b.unmount();

    renderView({ snapshot: snap({ current: null, status: 'ALLOCATION' }) });
    expect(screen.getByText('Auction complete')).toBeInTheDocument();
  });

  it('stars a soldier and alerts when their lot opens', async () => {
    const user = userEvent.setup();
    const { rerender } = renderView();
    await user.click(screen.getByRole('tab', { name: 'Watchlist' }));
    await user.click(screen.getByRole('button', { name: 'Star Three' }));
    expect(screen.getByRole('button', { name: 'Remove Three from watchlist' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(window.localStorage.getItem('mpl:watchlist:t')).toContain(P3);

    const s = snap();
    h.auction = fakeAuction({
      snapshot: {
        ...s,
        current: s.current && {
          ...s.current,
          playerId: P3,
          currentBid: null,
          currentTeamId: null,
        },
      },
    });
    rerender(<CaptainBidView viewer={viewer} teamId={TEAM_A} />);
    expect(h.toast.info).toHaveBeenCalledWith('Three is on the block!', expect.anything());
    expect(h.playSound).toHaveBeenCalledWith('open');
  });

  it('lists every squad under All teams', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('tab', { name: 'All teams' }));
    expect(screen.getByText('Niner')).toBeInTheDocument();
    expect(screen.getByText('Captain Cap Bravo')).toBeInTheDocument();
  });
});
