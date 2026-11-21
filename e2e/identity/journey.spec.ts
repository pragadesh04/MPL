import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';

// The dev server compiles each page on first visit; give assertions room.
const expect = baseExpect.configure({ timeout: 30_000 });

/**
 * Lane A journey (PLAN §13.4 A10): an organiser creates a tournament, brings people in by all
 * three paths (personal link, organiser key → approval, Player ID request → accept), captains set
 * up their teams, and the organiser starts the tournament. Plus a tenant-isolation check.
 *
 * Self-contained: every run registers fresh accounts, so it needs no seed. Run against the lane's
 * dev server:  PORT=3001 npx playwright test e2e/identity --project=desktop
 */

const run = Date.now().toString(36).slice(-5);
const uname = (role: string): string => `e2e_${role}_${run}`;
const PASSWORD = 'password123';

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function registerPlayer(page: Page, name: string, username: string, key?: string) {
  await page.goto(key ? `/register?key=${key}` : '/register');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Mini Militia IGN').fill(`${name.split(' ')[0]}_${run}`);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
}

async function api<T>(page: Page, url: string, data?: unknown): Promise<T> {
  const res =
    data === undefined ? await page.request.get(url) : await page.request.post(url, { data });
  expect(res.ok(), `${url} → ${res.status()}`).toBe(true);
  return (await res.json()) as T;
}

test.describe('identity journey', () => {
  test.setTimeout(300_000);

  test('organiser → three joining paths → team setup → Start', async ({ browser }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop only (creates shared accounts)');
    const tournamentName = `E2E Cup ${run}`;

    // ── Organiser signs up and creates a tournament ─────────────────────────────────────
    const org = await newPage(browser);
    await org.goto('/register/organiser');
    await org.getByLabel('Name', { exact: true }).fill('Eve Organiser');
    await org.getByLabel('Username').fill(uname('org'));
    await org.getByLabel('Email').fill(`${uname('org')}@example.test`);
    await org.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await org.getByLabel('Confirm password').fill(PASSWORD);
    await org.getByRole('button', { name: 'Create organiser account' }).click();
    await expect(org.getByRole('heading', { name: 'Command post' })).toBeVisible();

    await org.getByRole('button', { name: 'New tournament' }).click();
    const dialog = org.getByRole('dialog');
    await dialog.getByLabel('Name').fill(tournamentName);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await org.waitForURL(/\/t\/[0-9a-f-]{36}\/setup/);
    const tid = /\/t\/([0-9a-f-]{36})\//.exec(org.url())![1]!;
    const me = await api<{ user: { organiserKey: string } }>(org, '/api/auth/me');
    const key = me.user.organiserKey;

    // ── Path A: personal link for captain 1 ─────────────────────────────────────────────
    await org.goto(`/t/${tid}/people`);
    await org.getByRole('button', { name: 'Add person' }).click();
    const sheet = org.getByRole('dialog');
    await sheet.getByLabel('Type').selectOption('LEADER');
    await sheet.getByLabel('Name').fill('Arjun Link');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet).toBeHidden();
    const { leaders } = await api<{ leaders: { id: string; name: string }[] }>(
      org,
      `/api/tournaments/${tid}/leaders`,
    );
    const arjun = leaders.find((l) => l.name === 'Arjun Link')!;
    const { link } = await api<{ link: string }>(
      org,
      `/api/tournaments/${tid}/leaders/${arjun.id}/invite-link`,
    );
    const invitePath = new URL(link).pathname;

    const cap1 = await newPage(browser);
    await cap1.goto(invitePath);
    await expect(
      cap1
        .getByText('You’ve been invited as Captain')
        .or(cap1.getByText("You've been invited as Captain")),
    ).toBeVisible();
    await cap1.getByLabel('Mini Militia IGN').fill(`Arjun_${run}`);
    await cap1.getByLabel('Username').fill(uname('cap1'));
    await cap1.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await cap1.getByRole('button', { name: 'Create account & claim' }).click();
    await cap1.waitForURL(`**/t/${tid}/teams/setup`);
    await cap1.getByLabel('Team name').fill('Red Rhinos');
    await cap1.getByRole('button', { name: 'Blood red', exact: true }).click();
    await cap1.getByRole('button', { name: 'Team ready' }).click();
    await expect(
      cap1.getByText('You’re all set').or(cap1.getByText("You're all set")),
    ).toBeVisible();

    // ── Path B: captain 2 signs up with the organiser key; organiser approves ─────────
    const cap2 = await newPage(browser);
    await registerPlayer(cap2, 'Bilal Key', uname('cap2'), key);
    await expect(
      cap2.getByText(`You're joining`).or(cap2.getByText('You’re joining')),
    ).toBeVisible();
    await cap2.getByRole('radio', { name: /Captain/ }).click();
    await cap2.getByRole('button', { name: /Enlist as captain under/ }).click();
    await cap2.waitForURL('**/dashboard**');
    await expect(cap2.getByText(/Waiting for Eve to approve you as captain/)).toBeVisible();

    await org.goto(`/t/${tid}/people`);
    await org.getByRole('button', { name: /^Pending/ }).click();
    await org.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(org.getByText('Bilal Key approved')).toBeVisible();

    await cap2.goto(`/t/${tid}/teams/setup`);
    await cap2.getByLabel('Team name').fill('Blue Hawks');
    // Red is taken by the Rhinos: its swatch is disabled and names the team.
    await expect(cap2.getByRole('button', { name: /taken by Red Rhinos/ })).toBeDisabled();
    await cap2.getByRole('button', { name: 'Royal blue', exact: true }).click();
    await cap2.getByRole('button', { name: 'Team ready' }).click();
    await expect(
      cap2.getByText('You’re all set').or(cap2.getByText("You're all set")),
    ).toBeVisible();

    // ── Path C: a free agent gets a Player ID request and accepts ───────────────────────
    const sol = await newPage(browser);
    await registerPlayer(sol, 'Chen Request', uname('sol'));
    await sol.getByRole('button', { name: 'Create account' }).click();
    await sol.waitForURL('**/dashboard**');
    const playerId = (await sol
      .getByText(/^#[2-9A-HJKMNP-Z]{6}$/)
      .first()
      .textContent())!.trim();

    await org.goto(`/t/${tid}/people`);
    await org.getByLabel('Player ID').fill(playerId);
    await org.getByRole('button', { name: 'Find' }).click();
    await expect(org.getByText('Chen Request')).toBeVisible();
    await org.getByRole('radio', { name: /Soldier/ }).click();
    await org.getByRole('button', { name: 'Send request' }).click();
    await expect(org.getByText('Request sent to Chen Request')).toBeVisible();

    await sol.reload();
    await expect(sol.getByText(/invites you to/)).toBeVisible();
    await sol.getByRole('button', { name: 'Accept' }).click();
    await sol.waitForURL(`**/t/${tid}/people/me`);
    await expect(
      sol
        .getByText('You’re in! Waiting for the auction')
        .or(sol.getByText("You're in! Waiting for the auction")),
    ).toBeVisible();

    // ── Fill the pool (2 captains × 3–5 soldiers → 6–10 needed) ─────────────────────────
    for (let i = 1; i <= 5; i++) {
      await api(org, `/api/tournaments/${tid}/people`, {
        type: 'PLAYER',
        name: `Bulk Soldier ${i}`,
      });
    }

    // ── Review & Start ──────────────────────────────────────────────────────────────────
    await org.goto(`/t/${tid}/setup?step=review`);
    await expect(org.getByText('Ready to start')).toBeVisible();
    await org.getByRole('button', { name: 'Start tournament' }).click();
    const confirm = org.getByRole('dialog');
    await confirm.getByLabel(/to confirm/).fill(tournamentName);
    await confirm.getByRole('button', { name: 'Start tournament' }).click();
    await expect(org.getByText('Auction live').first()).toBeVisible();

    // Registration is closed now: the key preview says so.
    const preview = await api<{ canJoin: boolean }>(org, `/api/organiser-keys/${key}`);
    expect(preview.canJoin).toBe(false);

    // ── Tenant isolation: an unrelated organiser gets 404 everywhere ────────────────────
    const other = await newPage(browser);
    await other.goto('/register/organiser');
    await other.getByLabel('Name', { exact: true }).fill('Olly Other');
    await other.getByLabel('Username').fill(uname('other'));
    await other.getByLabel('Email').fill(`${uname('other')}@example.test`);
    await other.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await other.getByLabel('Confirm password').fill(PASSWORD);
    await other.getByRole('button', { name: 'Create organiser account' }).click();
    await expect(other.getByRole('heading', { name: 'Command post' })).toBeVisible();
    for (const path of ['people', 'teams', 'setup', 'settings']) {
      const res = await other.goto(`/t/${tid}/${path}`);
      expect(res?.status(), path).toBe(404);
    }
    const apiRes = await other.request.get(`/api/tournaments/${tid}/leaders`);
    expect(apiRes.status()).toBe(404);
  });
});
