import { act, renderHook } from '@testing-library/react';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { useAuctionRealtime } from './use-auction-realtime';

const T = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';

function snap(overrides: Partial<AuctionSnapshot> = {}): AuctionSnapshot {
  return {
    tournamentId: T,
    serverNow: new Date().toISOString(),
    version: 5,
    rosterVersion: 1,
    status: 'AUCTION_LIVE',
    round: 1,
    current: {
      playerId: P1,
      basePrice: 2,
      originalBasePrice: 2,
      isReauction: false,
      currentBid: null,
      currentTeamId: null,
      nextBid: 2,
      endsAt: new Date(Date.now() + 3_000).toISOString(),
    },
    nextAt: null,
    pausedRemainingMs: null,
    controllerUserId: null,
    lastResult: null,
    teams: [],
    pool: [],
    unsold: [],
    recentBids: [],
    ...overrides,
  };
}

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('useAuctionRealtime (no realtime connection)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const render = (initial: AuctionSnapshot) =>
    renderHook(() =>
      useAuctionRealtime({
        tournamentId: T,
        initialSnapshot: initial,
        increments: { type: 'flat', step: 1 },
      }),
    );

  it('polls the snapshot every 2 s while Ably is unavailable', async () => {
    fetchMock.mockImplementation(() => ok(snap({ version: 6, current: null })));
    const { result } = render(snap({ current: null }));
    expect(result.current.live).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(fetchMock).toHaveBeenCalledWith(`/api/tournaments/${T}/auction`, expect.anything());
    expect(result.current.snapshot.version).toBe(6);
  });

  it('nudges /tick when the countdown reaches 0', async () => {
    const initial = snap();
    fetchMock.mockImplementation((url: string) =>
      ok(url.endsWith('/tick') ? snap({ version: 6, current: null }) : initial),
    );
    const { result } = render(initial);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500);
    });
    const tickCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/tick'));
    expect(tickCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.current.snapshot.current).toBeNull();
  });

  it('bids with the current version and a fresh command id, then adopts the snapshot', async () => {
    fetchMock.mockImplementation(() => ok({ snapshot: snap({ version: 6 }) }));
    const { result } = render(snap());
    let res: Awaited<ReturnType<typeof result.current.bid>> | undefined;
    await act(async () => {
      res = await result.current.bid(2);
    });
    expect(res?.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/tournaments/${T}/auction/bids`);
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 2, expectedVersion: 5 });
    expect(result.current.snapshot.version).toBe(6);
  });

  it('refetches after an OUTBID answer', async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'OUTBID', message: 'x' } }), {
            status: 409,
          }),
        ),
      )
      .mockImplementation(() => ok(snap({ version: 9 })));
    const { result } = render(snap());
    await act(async () => {
      const r = await result.current.bid(2);
      expect(r).toMatchObject({ ok: false, status: 409, error: { code: 'OUTBID' } });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.snapshot.version).toBe(9);
  });
});
