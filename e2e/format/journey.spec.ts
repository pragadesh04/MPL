import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Lane C journey (PLAN §13.6 C8): --stage=allocated → group draw → results → Generate knockout →
 * knockout results → champion, plus tenant isolation and the phone matches hub.
 *
 *   npm run db:seed -- --stage=allocated     (with `next dev` stopped: PGlite is one connection)
 *   npm run dev -- -p 3003
 *   PORT=3003 npx playwright test e2e/format --workers=1
 *
 * `--workers=1` matters: the phone check reads what the desktop journey created.
 *
 * The journey changes data, so it runs once (desktop project). Set E2E_CHROMIUM_PATH to use an
 * already-installed Chromium instead of the one Playwright wants to download.
 */
if (process.env.E2E_CHROMIUM_PATH) {
  test.use({ launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH } });
}

const TOURNAMENT = "Ravi's MPL Season 2";

async function loginAs(page: Page, username: string, next = '/dev'): Promise<void> {
  await page.goto(`/dev/login-as?username=${username}&next=${encodeURIComponent(next)}`);
}

/** Ravi's tournament id and status, read from the dev page. */
async function findTournament(page: Page): Promise<{ id: string; status: string }> {
  await loginAs(page, 'ravi');
  const text = await page.locator('main').innerText();
  const m = new RegExp(`${TOURNAMENT.replace(/'/g, '.')} · (\\w+) · id ([0-9a-f-]{36})`).exec(text);
  if (!m) throw new Error('Seeded tournament not found: run npm run db:seed -- --stage=allocated');
  return { status: m[1]!, id: m[2]! };
}

interface ApiMatch {
  id: string;
  matchNumber: number | null;
  stage: string;
  round: number | null;
  bestOf: number;
  status: string;
  isBye: boolean;
  nextMatchId: string | null;
}

async function listMatches(request: APIRequestContext, id: string): Promise<ApiMatch[]> {
  const res = await request.get(`/api/tournaments/${id}/matches?view=list`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { matches: ApiMatch[] }).matches;
}

/** Slot A wins every game of a best-of match. */
async function playViaApi(request: APIRequestContext, id: string, m: ApiMatch): Promise<void> {
  const games = Array.from({ length: Math.ceil(m.bestOf / 2) }, () => ({ killsA: 20, killsB: 12 }));
  const res = await request.patch(`/api/tournaments/${id}/matches/${m.id}`, {
    data: { action: 'result', games },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Enter a result through the match sheet and result dialog: slot A wins `wins` games. */
/** The result dialog (the match sheet behind it is a dialog too). */
const resultDialog = (page: Page) =>
  page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Add game' }) });

async function playViaUi(page: Page, label: string, wins: number): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await page.getByRole('button', { name: /Enter result|Edit result/ }).click();
  const dialog = resultDialog(page);
  for (let g = 1; g <= wins; g++) {
    if (g > 1) await dialog.getByRole('button', { name: 'Add game' }).click();
    const kills = dialog.getByLabel(new RegExp(`^Game ${g} kills `));
    await kills.nth(0).fill('20');
    await kills.nth(1).fill(String(10 + g));
  }
  await dialog.getByRole('button', { name: 'Save result' }).click();
  // The first PATCH on a fresh dev server also compiles the route.
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await page.keyboard.press('Escape'); // close the match sheet
}

test.describe('format journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('draw → results → knockout → champion', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Changes data: runs once, on desktop.');
    test.setTimeout(300_000);
    const t = await findTournament(page);
    expect(t.status, 'seed with --stage=allocated first').toBe('GROUP_DRAW');

    // Group draw (random) from the organiser screen.
    await page.goto(`/t/${t.id}/groups`);
    await expect(page.getByText('Seeding pots')).toBeVisible();
    await page.getByRole('button', { name: 'Draw the groups' }).click();
    await expect(page.getByRole('heading', { name: 'The draw' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Group stage').first()).toBeVisible();

    // M1 through the result dialog, the rest of the group stage through the API.
    await page.getByRole('tab', { name: 'Fixtures' }).click();
    await playViaUi(page, 'Match 1 details', 1);
    await page.getByRole('tab', { name: 'Fixtures' }).click();
    await expect(page.getByText('1–0').first()).toBeVisible();
    for (const m of await listMatches(page.request, t.id)) {
      if (m.stage === 'GROUP' && m.status !== 'DONE') await playViaApi(page.request, t.id, m);
    }

    // Qualified! → Generate knockout.
    await page.reload();
    await expect(page.getByText('Qualified!')).toBeVisible();
    await page.getByRole('button', { name: 'Generate knockout' }).click();
    await expect(page.getByText('Qualified!')).toBeHidden({ timeout: 60_000 });

    // Semi-finals through the API, the final (best of 5) through the dialog on the knockout page.
    const ko = (await listMatches(page.request, t.id)).filter(
      (m) => m.stage === 'KNOCKOUT' && !m.isBye,
    );
    const final = ko.find((m) => m.nextMatchId === null)!;
    for (const m of ko.filter((x) => x.id !== final.id)) await playViaApi(page.request, t.id, m);
    await page.goto(`/t/${t.id}/knockout`);
    await expect(page.getByText('Seeding · Semi-final')).toBeVisible();
    await page.getByRole('button', { name: `Final M${final.matchNumber}` }).click();
    await page.getByRole('button', { name: 'Enter result' }).click();
    const dialog = resultDialog(page);
    for (let g = 1; g <= 3; g++) {
      if (g > 1) await dialog.getByRole('button', { name: 'Add game' }).click();
      const kills = dialog.getByLabel(new RegExp(`^Game ${g} kills `));
      await kills.nth(0).fill('25');
      await kills.nth(1).fill('20');
    }
    await dialog.getByRole('button', { name: 'Save result' }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await page.keyboard.press('Escape'); // close the match sheet

    // Champion screen and COMPLETED.
    await expect(page.getByRole('region', { name: /^Champions:/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('Completed').first()).toBeVisible();
    await page.goto(`/t/${t.id}`);
    await expect(page.getByRole('region', { name: /^Champions:/ })).toBeVisible();
  });

  test('another organiser gets 404 on every Lane C page', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'Read-only check, once is enough.');
    test.setTimeout(180_000);
    const ravi = await browser.newPage();
    const t = await findTournament(ravi);
    await ravi.close();
    const meera = await browser.newPage();
    await loginAs(meera, 'meera');
    for (const path of [
      '',
      '/matches',
      '/groups',
      '/knockout',
      '/teams-overview',
      '/stats',
      '/audit',
    ]) {
      const res = await meera.goto(`/t/${t.id}${path}`);
      expect(res?.status(), path || '/').toBe(404);
    }
    const api = await meera.request.get(`/api/tournaments/${t.id}/matches`);
    expect(api.status()).toBe(404);
    await meera.close();
  });

  test('a soldier sees the matches hub on a phone, in list and tree', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'Phone layout check.');
    test.setTimeout(180_000);
    const t = await findTournament(page);
    test.skip(
      t.status === 'GROUP_DRAW',
      'Needs a drawn tournament (run the desktop journey first).',
    );
    await loginAs(page, 'a_sol01', `/t/${t.id}/matches`);
    await expect(page.getByRole('heading', { name: 'Matches' })).toBeVisible();
    await page.getByRole('radio', { name: 'Tree' }).click();
    await expect(page.getByRole('button', { name: 'Fit to screen' })).toBeVisible();
    await page.getByRole('radio', { name: 'List' }).click();
    await expect(page.getByRole('heading', { name: 'Group stage' })).toBeVisible();
  });
});
