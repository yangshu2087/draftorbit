import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const webRoot = process.cwd();
const port = Number(process.env.WEB_PLAYWRIGHT_PORT ?? 3300);
const baseURL = process.env.WEB_PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const skipWebServer = process.env.WEB_PLAYWRIGHT_SKIP_WEBSERVER === '1';
const workerCount = Number(process.env.WEB_PLAYWRIGHT_WORKERS ?? (process.env.CI ? 4 : 1));
const runFullyParallel = process.env.WEB_PLAYWRIGHT_FULLY_PARALLEL === '1' || (process.env.CI === 'true' && process.env.WEB_PLAYWRIGHT_FULLY_PARALLEL !== '0');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: runFullyParallel,
  workers: workerCount,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  outputDir: resolve(webRoot, '../../output/playwright/web-ci'),
  use: {
    baseURL,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'zh-CN',
    timezoneId: 'America/Los_Angeles'
  },
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: `NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL=/__api NEXT_PUBLIC_ENABLE_LOCAL_LOGIN=true pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
          cwd: webRoot,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 90_000,
          stdout: 'pipe' as const,
          stderr: 'pipe' as const
        }
      }),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }
    }
  ]
});
