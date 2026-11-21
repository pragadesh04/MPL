import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { AuctioneerConsole } from './auctioneer-console';
import { OTHER, makeAuction, makeSnapshot, makeViewer, player } from './test-fixtures';

let auction = makeAuction(makeSnapshot());

vi.mock('../shared/auction-context', () => ({ useAuction: () => auction }));
vi.mock('../realtime/use-presence', () => ({
  usePresence: () => ({ online: new Set(['ua']), available: true }),
}));

function setup(snapshot: AuctionSnapshot = makeSnapshot(), viewer = makeViewer()) {
  auction = makeAuction(snapshot);
  const user = userEvent.setup();
  render(<AuctioneerConsole viewer={viewer} />);
  return { user, auction };
}

describe('AuctioneerConsole · controller banner', () => {
  it("says you're in control when you hold the console", () => {
    setup();
    expect(screen.getByText("You're in control")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take control' })).not.toBeInTheDocument();
  });

  it('names the other organiser, goes read-only and offers Take control', async () => {
    const { user, auction } = setup(makeSnapshot({ controllerUserId: OTHER }));
    expect(screen.getByText('Ravi is running the auction')).toBeInTheDocument();
    expect(screen.getByText(/Read-only: Ravi is running the auction/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sold now/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Take control' }));
    expect(auction.command).toHaveBeenCalledWith({ type: 'take-control' });
  });

  it('says nobody is running it yet when control is free', () => {
    setup(makeSnapshot({ controllerUserId: null }));
    expect(screen.getByText('Nobody is running the auction yet')).toBeInTheDocument();
    expect(screen.getByText('Your first console command takes control.')).toBeInTheDocument();
    // The first command takes control on the server, so the console stays usable.
    expect(screen.getByRole('button', { name: /Sold now/ })).toBeEnabled();
  });
});

describe('AuctioneerConsole · team strip', () => {
  it('disables the fallback bid with the rule reason', () => {
    setup();
    const full = screen.getByRole('button', { name: 'Bid for Charlie: 5 MP' });
    expect(full).toBeDisabled();
    expect(full).toHaveAccessibleDescription('Squad full');
    expect(screen.getByRole('button', { name: 'Bid for Bravo: 5 MP' })).toHaveAccessibleDescription(
      'Leading',
    );
    expect(screen.getByRole('button', { name: 'Bid for Alpha: 5 MP' })).toBeEnabled();
  });

  it('places a fallback bid for the team', async () => {
    const { user, auction } = setup();
    await user.click(screen.getByRole('button', { name: 'Bid for Alpha: 5 MP' }));
    expect(auction.bid).toHaveBeenCalledWith(5, 'a');
  });

  it('hides fallback bids when auctioneer bids are off', () => {
    auction = makeAuction(makeSnapshot(), { settings: { allowAuctioneerBids: false } });
    render(<AuctioneerConsole viewer={makeViewer()} />);
    expect(screen.queryByRole('button', { name: /Bid for Alpha/ })).not.toBeInTheDocument();
  });
});

describe('AuctioneerConsole · keyboard shortcuts', () => {
  it('S sells the current soldier', async () => {
    const { user, auction } = setup();
    await user.keyboard('s');
    expect(auction.command).toHaveBeenCalledWith({ type: 'sold' });
  });

  it('1 places a fallback bid for the first team, U marks unsold', async () => {
    const { user, auction } = setup();
    await user.keyboard('1');
    await waitFor(() => expect(auction.bid).toHaveBeenCalledWith(5, 'a'));
    await user.keyboard('u');
    await waitFor(() => expect(auction.command).toHaveBeenCalledWith({ type: 'unsold' }));
  });

  it('ignores keys while typing in a field', async () => {
    const { auction } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 's' });
    expect(auction.command).not.toHaveBeenCalled();
    input.remove();
  });

  it('does nothing when another organiser holds control', async () => {
    const { user, auction } = setup(makeSnapshot({ controllerUserId: OTHER }));
    await user.keyboard('s');
    expect(auction.command).not.toHaveBeenCalled();
  });

  it('drops a second press while the first request is in flight', async () => {
    const { auction } = setup();
    let release: () => void = () => undefined;
    auction.command.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: { snapshot: makeSnapshot() } });
        }),
    );
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 's' });
    expect(auction.command).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: /Sold now/ })).toBeEnabled());
  });

  it('Ctrl+Z opens the undo dialog, which needs a reason', async () => {
    const { user, auction } = setup();
    await user.keyboard('{Control>}z{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Undo last sale' });
    const confirm = within(dialog).getByRole('button', { name: 'Undo sale' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason'), 'Wrong team');
    await user.click(confirm);
    expect(auction.command).toHaveBeenCalledWith({ type: 'undo', reason: 'Wrong team' });
  });

  it('? opens the cheat sheet', async () => {
    const { user } = setup();
    await user.keyboard('?');
    expect(await screen.findByRole('dialog', { name: 'Field shortcuts' })).toBeInTheDocument();
  });
});

describe('AuctioneerConsole · header', () => {
  it('requires the typed tournament name to reset', async () => {
    const { user, auction } = setup();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reset auction' });
    const confirm = within(dialog).getByRole('button', { name: 'Reset auction' });
    const input = within(dialog).getByRole('textbox');
    await user.type(input, "Ravi's MPL");
    expect(confirm).toBeDisabled();
    await user.type(input, ' Season 2');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(auction.command).toHaveBeenCalledWith({
      type: 'reset',
      confirmName: "Ravi's MPL Season 2",
    });
  });

  it('hides Reset from organisers without the permission', () => {
    setup(makeSnapshot(), makeViewer({ canReset: false, roles: ['CO_ADMIN'] }));
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
  });

  it('disables Start new round with the reason when the pool is empty', () => {
    setup(
      makeSnapshot({
        current: null,
        pool: [],
        unsold: [player('p9', 'Echo', { status: 'UNSOLD' })],
        lastResult: {
          playerId: 'p9',
          result: 'UNSOLD',
          teamId: null,
          price: null,
          reason: 'NO_BIDS',
        },
      }),
    );
    const button = screen.getByRole('button', { name: 'Start new round' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'Start new round: No soldiers in the pool. Use Auction again on unsold soldiers first.',
    );
  });

  it('starts the auction from the lobby', async () => {
    const { user, auction } = setup(makeSnapshot({ current: null, pool: [player('p2', 'Viper')] }));
    await user.click(screen.getByRole('button', { name: 'Start auction' }));
    expect(auction.command).toHaveBeenCalledWith({ type: 'next' });
  });

  it('shows Polling instead of an error without a live connection', () => {
    auction = { ...makeAuction(makeSnapshot()), live: false };
    render(<AuctioneerConsole viewer={makeViewer()} />);
    expect(screen.getByText('Polling')).toBeInTheDocument();
  });
});

describe('AuctioneerConsole · side panel', () => {
  it('re-queues and assigns unsold soldiers', async () => {
    const { user, auction } = setup(
      makeSnapshot({ unsold: [player('p9', 'Echo', { status: 'UNSOLD' })] }),
    );
    await user.click(screen.getByRole('tab', { name: 'Unsold (1)' }));
    await user.click(screen.getByRole('button', { name: 'Auction Echo again' }));
    expect(auction.command).toHaveBeenCalledWith({ type: 'auction-again', playerId: 'p9' });
  });

  it('hides roster actions without the roster permission', async () => {
    const { user } = setup(
      makeSnapshot({ unsold: [player('p9', 'Echo', { status: 'UNSOLD' })] }),
      makeViewer({ canRoster: false, canReset: false, roles: ['AUCTIONEER'] }),
    );
    await user.click(screen.getByRole('tab', { name: 'Unsold (1)' }));
    expect(screen.getByText('Echo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Auction Echo again' })).not.toBeInTheDocument();
  });
});
