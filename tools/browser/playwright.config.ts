import { browserEnv } from '@kobato/browser/browser-env'
import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// The journeys are authored in the app tree; this config lives in the package
// that owns Playwright so its own imports resolve through node_modules beside
// it (Playwright loads the config without tsconfig path mapping).
const BROWSER_TEST_DIR = fileURLToPath(new URL('../../apps/kobato/tests/browser', import.meta.url))
const APP_TMP_DIR = fileURLToPath(new URL('../../apps/kobato/tmp', import.meta.url))

const env = browserEnv()
const channel = process.env.KOBATO_BROWSER_CHANNEL ?? (process.env.CI ? 'chromium' : 'chrome')

export default defineConfig({
  testDir: BROWSER_TEST_DIR,
  testMatch: '**/*.spec.ts',

  globalSetup: fileURLToPath(new URL('../../apps/kobato/tests/browser/support/global-setup.ts', import.meta.url)),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: process.env.CI === 'true',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: `${APP_TMP_DIR}/browser-results`,
  reporter: [['list'], ['html', { outputFolder: `${APP_TMP_DIR}/browser-report`, open: 'never' }]],
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
