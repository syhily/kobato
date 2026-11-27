import { browserEnv } from '@kobato/instance/client/browser-env'
import { REPO_ROOT } from '@kobato/test/repo-root'
import { defineConfig } from '@playwright/test'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KO_TEST_DIR = join(REPO_ROOT, 'apps/kobato/tests/browser')
const SAYAKA_TEST_DIR = join(REPO_ROOT, 'apps/sayaka/tests/browser')
const KO_TMP_DIR = join(REPO_ROOT, 'apps/kobato/tmp')
const SAYAKA_TMP_DIR = join(REPO_ROOT, 'apps/sayaka/tmp')

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
