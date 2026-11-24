/* eslint-disable react-hooks/rules-of-hooks */

import type { BrowserContext, Page } from '@playwright/test'

import { browserEnv } from '@kobato/pack/instance/client/browser-env'
import { test as base } from '@playwright/test'
import { signInAdmin } from '@tests/browser/support/journey'
import { SettingsApi } from '@tests/browser/support/settings-api'

interface WorkerFixtures {
  authState: Awaited<ReturnType<BrowserContext['storageState']>>
  adminContext: BrowserContext
  settingsApi: SettingsApi
}

interface TestFixtures {
  adminPage: Page
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  settingsApi: [
    // eslint-disable-next-line no-empty-pattern
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
