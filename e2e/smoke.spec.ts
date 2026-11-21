import { expect, test } from '@playwright/test';

// Phase 0 smoke test. Lane suites live in e2e/identity, e2e/auction and e2e/format.
test('health check and landing page', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ ok: true, db: 'up' });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MPL' })).toBeVisible();
});

test('app pages redirect to /login without a session', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});
