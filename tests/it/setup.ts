// Vitest worker setup for integration tests. Creates a fresh Postgres database
// per worker before any test file runs.

import { afterAll, afterEach } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'

let testDbUrl: string | null = null

const { createWorkerDatabase, dropWorkerDatabase } = await import('#/_helpers/integration-db')
const workerId = process.env.VITEST_WORKER_ID || '0'
testDbUrl = await createWorkerDatabase(workerId)
process.env.DATABASE_URL = testDbUrl

afterAll(async () => {
  if (testDbUrl) {
    await dropWorkerDatabase(testDbUrl)
  }
})

// Provide the env vars `@/server/env` requires at module-load time.
import '#/_helpers/env'

// Seed the in-process settings snapshot once per worker.
BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(Promise.resolve(TEST_BLOG_SETTINGS_BUNDLE))

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
})
