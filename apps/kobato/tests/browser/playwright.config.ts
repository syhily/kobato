// Playwright config for the real-browser i18n journeys. It never boots a server itself:
// `pnpm run test:browser` / `pnpm run sea:browser` start a throwaway SEA instance (or point
// at an external one) and inject the KOBATO_BROWSER_* env contract — see
// `scripts/browser/run.ts`. Local runs use the system Chrome channel; CI sets
// KOBATO_BROWSER_CHANNEL=chromium, and KOBATO_BROWSER_HEADLESS=0 gives a headed run.

import { defineConfig } from '@playwright/test'

import { browserEnv } from './support/env'

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
