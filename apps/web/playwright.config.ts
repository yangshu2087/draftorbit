import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const webRoot = process.cwd();
const port = Number(process.env.WEB_PLAYWRIGHT_PORT ?? 3300);
const baseURL = process.env.WEB_PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: resolve(webRoot, '../../output/playwright/web-ci-report') }]] : 'list',
  outputDir: resolve(webRoot, '../../output/playwright/web-ci'),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'zh-CN',
    timezoneId: 'America/Los_Angeles'
  },
  webServer: {
    command: `NEXT_PUBLIC_API_URL=/__api NEXT_PUBLIC_ENABLE_LOCAL_LOGIN=true pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    cwd: webRoot,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    stdout: 'pipe',
    stderr: 'pipe'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }
    }
  ]
});
