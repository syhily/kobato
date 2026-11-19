import { defineConfig } from '@playwright/test'

// The one relative import: Playwright loads the config itself WITHOUT tsconfig
// path mapping (only test files get it), so the alias cannot resolve here.
import { browserEnv } from './support/env.ts'

const env = browserEnv()
const channel = process.env.KOBATO_BROWSER_CHANNEL ?? (process.env.CI ? 'chromium' : 'chrome')

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',

  globalSetup: './support/global-setup.ts',
  // One shared instance with mutable settings and cross-tab journeys — never parallel.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: process.env.CI === 'true',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: '../../tmp/browser-results',
  reporter: [['list'], ['html', { outputFolder: '../../tmp/browser-report', open: 'never' }]],
  use: {
    baseURL: env.baseUrl,
    channel,
    headless: process.env.KOBATO_BROWSER_HEADLESS !== '0',
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
})
