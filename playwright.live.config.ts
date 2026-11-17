import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const credentialsFile = resolve(process.cwd(), '.env.test.local');
if (existsSync(credentialsFile)) process.loadEnvFile(credentialsFile);

const baseURL = process.env.SADHANA_LIVE_BASE_URL || 'https://sadhana-dev.sruti.co.uk';
const target = new URL(baseURL);

if (target.origin !== 'https://sadhana-dev.sruti.co.uk') {
  throw new Error(
    `Live portal tests are restricted to https://sadhana-dev.sruti.co.uk; received ${target.origin}`,
  );
}

export default defineConfig({
  testDir: './test/portal/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-live' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: target.origin,
    viewport: { width: 1280, height: 800 },
    locale: 'en-GB',
    colorScheme: 'light',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
