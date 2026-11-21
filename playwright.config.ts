import { defineConfig, devices } from '@playwright/test';

/**
 * E2E. Each lane runs its own dev server port (A 3001, B 3002, C 3003, PLAN §13.1):
 *   PORT=3002 npm run test:e2e
 * Seed first: `npm run db:seed -- --stage=<stage>`; log in through /dev/login-as?username=…
 */
const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${port}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
