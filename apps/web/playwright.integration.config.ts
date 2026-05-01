import { defineConfig, devices } from '@playwright/test';

const host = '127.0.0.1';
const port = process.env.MARGIN_WEB_TEST_PORT ?? '5173';

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://${host}:${port}`,
    trace: 'on-first-retry'
  },
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port}`,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
