// Playwright's fixture `use` callback is not React's `use` hook; the
// react-hooks rule cannot tell the two apart in this file.
/* eslint-disable react-hooks/rules-of-hooks */

import type { BrowserContext, Page } from '@playwright/test'

import { browserEnv } from '@kobato/browser/browser-env'
import { test as base } from '@playwright/test'
import { signInAdmin } from '@tests/browser/support/journey'
import { SettingsApi } from '@tests/browser/support/settings-api'

interface WorkerFixtures {
  authState: Awaited<ReturnType<BrowserContext['storageState']>>
  /** One context shared by every test in the worker — BroadcastChannel peers
   *  need a single browser context (origin + process), exactly like two tabs. */
  adminContext: BrowserContext
  settingsApi: SettingsApi
}

interface TestFixtures {
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
