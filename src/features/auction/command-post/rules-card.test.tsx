import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionResult } from '@/lib/schemas/api';
import { DEFAULT_SETTINGS, type TournamentSettings } from '@/lib/schemas/settings';
import { RulesCard } from './rules-card';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const settings: TournamentSettings = { ...DEFAULT_SETTINGS, bidTimerSeconds: 60 };

function setup(editable = true) {
  const onSave = vi.fn(
    async (
      _id: string,
      patch: Partial<TournamentSettings>,
    ): Promise<ActionResult<TournamentSettings>> => ({
      ok: true,
      data: { ...settings, ...patch },
    }),
  );
  const user = userEvent.setup();
  render(<RulesCard tournamentId="t1" settings={settings} editable={editable} onSave={onSave} />);
  return { user, onSave };
}

describe('RulesCard', () => {
  beforeEach(() => refresh.mockClear());

  it('rejects a timer reset longer than the bid timer', async () => {
    const { user, onSave } = setup();
    const reset = screen.getByLabelText('Timer reset');
    await user.clear(reset);
    await user.type(reset, '90');
    await user.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(
      await screen.findByText('Timer reset must not exceed the bid timer'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the live rules, then refreshes', async () => {
    const { user, onSave } = setup();
    const timer = screen.getByLabelText('Bid timer');
    await user.clear(timer);
    await user.type(timer, '45');
    const reset = screen.getByLabelText('Timer reset');
    await user.clear(reset);
    await user.type(reset, '30');
    await user.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSave).toHaveBeenCalledWith('t1', {
      bidTimerSeconds: 45,
      timerResetSeconds: 30,
      breakSeconds: 2,
      unsoldPolicy: 'REAUCTION_THEN_ALLOCATE',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the server error', async () => {
    const { user, onSave } = setup();
    onSave.mockResolvedValueOnce({
      ok: false,
      error: { code: 'RULE_VIOLATION', message: 'Live rules can only change during the auction' },
    });
    const brk = screen.getByLabelText('Break');
    await user.clear(brk);
    await user.type(brk, '5');
    await user.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(
      await screen.findByText('Live rules can only change during the auction', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('is a read-only summary without edit rights', () => {
    setup(false);
    expect(screen.queryByRole('button', { name: 'Save rules' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Other rules are locked after Start.', { exact: false }),
    ).toBeInTheDocument();
    // Bid timer and timer reset (both 60 s) shown as plain values.
    expect(screen.getAllByText('60 s')).toHaveLength(2);
    expect(screen.queryByLabelText('Bid timer')).not.toBeInTheDocument();
  });
});
