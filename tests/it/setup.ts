// Vitest worker setup for integration tests. Creates a fresh Postgres database
// per worker before any test file runs.

import { afterAll, afterEach } from 'vitest'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

let testDbUrl: string | null = null

const { createWorkerDatabase, dropWorkerDatabase } = await import('#/_helpers/integration-db')
const workerId = process.env.VITEST_WORKER_ID || '0'
testDbUrl = await createWorkerDatabase(workerId)
process.env.database__url = testDbUrl

afterAll(async () => {
  if (testDbUrl) {
    await dropWorkerDatabase(testDbUrl)
  }
})

// Provide the env vars `@/server/env` requires at module-load time.
import '#/_helpers/env'

// Seed the in-process settings snapshot once per worker.
setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
