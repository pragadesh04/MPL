import { expect, test, devices, type Browser, type Page } from '@playwright/test';

/**
 * Lane B e2e (PLAN §13.5 B9): two captains bid against each other from phones while the organiser
 * runs the console, then the organiser sells the soldier.
 *
 * Needs the `auction` seed and the dev server (works with or without Ably; without it the screens
 * poll every 2 s):
 *   npm run db:seed -- --stage=auction
 *   PORT=3002 npx playwright test e2e/auction --project=desktop
 * Set E2E_TOURNAMENT_ID to Ravi's tournament id, or it is read from the public live page.
 *
 * Each run sells a soldier, so the seeded auction eventually ends (status ALLOCATION). The test
 * skips itself then, or when fewer than two captains can still bid: reseed. The first run after
 * starting the dev server is slower while Turbopack compiles routes; timeouts allow for that.
 */

interface Snapshot {
  status: string;
  serverNow: string;
  current: { nextBid: number; endsAt: string | null } | null;
  teams: {
    name: string;
    shortName: string;
    sortOrder: number;
    squadSize: number;
    purseRemaining: number;
  }[];
}

async function snapshot(page: Page, id: string): Promise<Snapshot> {
  return (await (await page.request.get(`/api/tournaments/${id}/auction`)).json()) as Snapshot;
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

async function tournamentId(page: Page): Promise<string> {
  if (process.env.E2E_TOURNAMENT_ID) return process.env.E2E_TOURNAMENT_ID;
  const html = await (await page.request.get('/live/ravi-live/auction')).text();
  const match = /tournamentId\\?":\\?"([0-9a-f-]{36})/.exec(html);
  if (!match?.[1]) throw new Error('Run `npm run db:seed -- --stage=auction` first');
  return match[1];
}

async function loginAs(browser: Browser, username: string, path: string, phone: boolean) {
  const context = await browser.newContext(phone ? { ...devices['Pixel 7'] } : {});
  const page = await context.newPage();
  await page.goto(`/dev/login-as?username=${username}&next=${encodeURIComponent(path)}`);
  return page;
}

const bidButton = (page: Page) => page.getByRole('button', { name: /^bid \d+ mp$/i });

test('two captains bid against each other and the organiser sells', async ({ browser, page }) => {
  const id = await tournamentId(page);
  const room = `/t/${id}/auction`;

  // ── Organiser: take control and make sure a soldier is on the block ──────────────────
  const organiser = await loginAs(browser, 'ravi', room, false);
  const before = await snapshot(organiser, id);
  test.skip(
    before.status !== 'AUCTION_LIVE' && before.status !== 'AUCTION_PAUSED',
    'The seeded auction is over: reseed with --stage=auction',
  );
  await expect(organiser.getByText(/auctioneer console/i)).toBeVisible({ timeout: 30_000 });
  const take = organiser.getByRole('button', { name: /take control/i });
  if (await take.isVisible()) await take.click();
  const resume = organiser.getByRole('button', { name: /^resume$/i });
  if (await resume.isVisible()) await resume.click();
  const soldNow = organiser.getByRole('button', { name: /sold now/i });
  // Need a lot with most of its clock left; discard one that is about to run out.
  const left = before.current?.endsAt
    ? Date.parse(before.current.endsAt) - Date.parse(before.serverNow)
    : 0;
  const unsold = organiser.getByRole('button', { name: /mark unsold/i });
  if (before.current && left < 40_000 && (await unsold.isVisible())) await unsold.click();
  await expect(async () => {
    if (await soldNow.isVisible()) return;
    const open = organiser.getByRole('button', { name: /^(start auction|next soldier)$/i });
    if (await open.first().isVisible()) await open.first().click();
    await expect(soldNow).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  // ── Pick two captains whose teams can still buy (repeated runs fill squads) ──────────
  const live = await snapshot(organiser, id);
  const need = (live.current?.nextBid ?? 1) + 3;
  // Seeded captains: team with sortOrder i belongs to `a_cap<i + 1>`.
  const usable = live.teams.filter((t) => t.squadSize < 6 && t.purseRemaining >= need);
  test.skip(usable.length < 2, 'Reseed: fewer than two captains can still bid');
  const [teamOne, teamTwo] = [usable[0]!, usable[1]!];
  const first = await loginAs(browser, `a_cap${teamOne.sortOrder + 1}`, room, true);
  const second = await loginAs(browser, `a_cap${teamTwo.sortOrder + 1}`, room, true);

  // ── Captain 1 opens the bidding ───────────────────────────────────────────────────────
  await expect(bidButton(first)).toBeEnabled({ timeout: 20_000 });
  const firstAmount = Number(/\d+/.exec((await bidButton(first).textContent()) ?? '')?.[0]);
  await bidButton(first).click();
  await expect(first.getByText(/you're winning|hold steady/i).first()).toBeVisible({
    timeout: 30_000,
  });

  // ── Captain 2 outbids; captain 1 is told and can bid again ───────────────────────────
  // Wait until captain 2's phone has seen captain 1's bid. Clicking a stale button would be
  // refused as OUTBID ("Someone bid first"), which is correct but not what this test checks.
  await expect(async () => {
    const shown = Number(/\d+/.exec((await bidButton(second).textContent()) ?? '')?.[0]);
    expect(shown).toBeGreaterThan(firstAmount);
  }).toPass({ timeout: 30_000 });
  await expect(bidButton(second)).toBeEnabled({ timeout: 30_000 });
  const secondAmount = Number(/\d+/.exec((await bidButton(second).textContent()) ?? '')?.[0]);
  await bidButton(second).click();
  await expect(second.getByText(/you're winning|hold steady/i).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(first.getByText(/outbid/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(bidButton(first)).toBeEnabled({ timeout: 30_000 });
  const nextForFirst = Number(/\d+/.exec((await bidButton(first).textContent()) ?? '')?.[0]);
  expect(nextForFirst).toBeGreaterThan(secondAmount);

  // ── The organiser sells to the leader; everyone sees the result ──────────────────────
  // Sell only once the console shows captain 2 leading: a console command with a stale version is
  // refused (STALE_VERSION), which is correct, but this test wants the sale.
  await expect(
    organiser.getByText(`${teamTwo.name} (${teamTwo.shortName}) leads`).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(soldNow).toBeEnabled({ timeout: 30_000 });
  await soldNow.click();
  for (const p of [organiser, first, second]) {
    await expect(p.getByText(/^sold$/i).first()).toBeVisible({ timeout: 30_000 });
  }
});
