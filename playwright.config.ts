import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const isDemo = process.env.DEMO_E2E === '1';
const PORT = process.env.PORT || 5173;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e/browser',
  globalSetup: resolve('./tests/e2e/browser/global-setup.ts'),
  globalTeardown: resolve('./tests/e2e/browser/global-teardown.ts'),
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: {
    timeout: 20000
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: isDemo ? 'on' : 'retain-on-failure',
    headless: !isDemo,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_BROWSERS_PATH
        ? { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` }
        : {}),
      ...(isDemo ? { slowMo: 600 } : {})
    }
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 }
      }
    }
  ]
});
