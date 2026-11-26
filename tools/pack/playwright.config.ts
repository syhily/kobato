import { browserEnv } from '@kobato/pack/instance/client/browser-env'
import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const KO_TEST_DIR = fileURLToPath(new URL('../../apps/kobato/tests/browser', import.meta.url))
const SAYAKA_TEST_DIR = fileURLToPath(new URL('../../apps/sayaka/tests/browser', import.meta.url))
const KO_TMP_DIR = fileURLToPath(new URL('../../apps/kobato/tmp', import.meta.url))
const SAYAKA_TMP_DIR = fileURLToPath(new URL('../../apps/sayaka/tmp', import.meta.url))

const env = browserEnv()
const channel = process.env.KOBATO_BROWSER_CHANNEL ?? 'chromium'

export default defineConfig({
  testMatch: '**/*.spec.ts',

  globalSetup: fileURLToPath(new URL('./src/browser/global-setup.ts', import.meta.url)),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: process.env.CI === 'true',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: `${KO_TMP_DIR}/browser-report`, open: 'never' }]],
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
  projects: [
    { name: 'kobato', testDir: KO_TEST_DIR, outputDir: `${KO_TMP_DIR}/browser-results` },
    { name: 'sayaka', testDir: SAYAKA_TEST_DIR, outputDir: `${SAYAKA_TMP_DIR}/browser-results` },
  ],
})
