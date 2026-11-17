// Fixtures shared by the browser journeys: one real server sign-in per worker
// (reused as a storage state), a worker-scoped context for two-tab journeys, and
// one authenticated HTTP client for deterministic settings staging.

// Playwright's fixture `use` callback is not React's `use` hook; the
// react-hooks rule cannot tell the two apart in this file.
/* eslint-disable react-hooks/rules-of-hooks */

import type { BrowserContext, Page } from '@playwright/test'

import { test as base } from '@playwright/test'

import { browserEnv } from './env'
import { signInAdmin } from './journey'
import { SettingsApi } from './settings-api'

interface WorkerFixtures {
  /** Cookies + localStorage from the one real server sign-in. */
  authState: Awaited<ReturnType<BrowserContext['storageState']>>
  /** One context shared by every test in the worker — BroadcastChannel peers
   *  need a single browser context (origin + process), exactly like two tabs. */
  adminContext: BrowserContext
  settingsApi: SettingsApi
}

interface TestFixtures {
  /** A fresh tab in the shared, authenticated context. */
  adminPage: Page
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  settingsApi: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
    async ({}, use) => {
      await use(await SettingsApi.connect(browserEnv()))
    },
    { scope: 'worker' },
  ],

  authState: [
    async ({ browser }, use) => {
      const context = await browser.newContext()
      try {
        await signInAdmin(context, browserEnv())
        await use(await context.storageState())
      } finally {
        await context.close()
      }
    },
    { scope: 'worker' },
  ],

  adminContext: [
    async ({ browser, authState }, use) => {
      const context = await browser.newContext({ storageState: authState })
      await use(context)
      await context.close()
    },
    { scope: 'worker' },
  ],

  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage()
    await use(page)
    await page.close()
  },
})

export { expect } from '@playwright/test'
