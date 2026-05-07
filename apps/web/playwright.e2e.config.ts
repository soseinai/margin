import { defineConfig, devices } from '@playwright/test';

const host = '127.0.0.1';
const port = process.env.MARGIN_WEB_E2E_PORT ?? '5174';
const runLiveSoseinE2e = Boolean(process.env.MARGIN_SOSEIN_LIVE_URL && process.env.MARGIN_SOSEIN_E2E_AUTH_TOKEN);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://${host}:${port}`,
    trace: 'on-first-retry'
  },
  webServer: runLiveSoseinE2e
    ? {
      command: `npm run dev -- --host ${host} --port ${port}`,
      url: `http://${host}:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
