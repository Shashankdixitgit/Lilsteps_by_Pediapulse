import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Pedia Pulse clinical dashboard.
 *
 * Local dev: `npm run test:e2e`. Reuses an already-running dev server at
 * :3000 if one exists; otherwise spins one up.
 *
 * Test data: tests assume the seeded doctor user (drmadhav2112@yahoo.co.in)
 * exists. Seed it via `supabase auth admin create-user` + INSERT into
 * `public.doctor_auth` before running.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // shared DB state — run serially
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
