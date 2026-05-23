// Vitest worker setup. Runs once per worker before any test file in that
// worker. Must create the test database before the first test file imports
// `db.pool.ts` (which reads DATABASE_URL at module-load time).

import { afterAll } from 'vitest'

import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/blog'

import { TEST_BLOG_SETTINGS_BUNDLE } from './_helpers/blog-settings'

let testDbUrl: string | null = null

const { createWorkerDatabase, dropWorkerDatabase } = await import('./_helpers/integration-db')
const workerId = process.env.VITEST_WORKER_ID || '0'
testDbUrl = await createWorkerDatabase(workerId)
process.env.DATABASE_URL = testDbUrl

afterAll(async () => {
  // Some test files mock `db.pool`; use optional access so the cleanup
  // does not blow up when the hoisted mock lacks `closePool`.
  try {
    const mod = await import('@/server/infra/db/pool')
    await (mod as { closePool?: () => Promise<void> }).closePool?.()
  } catch {
    // ignore — pool may already be closed by shutdown hooks
  }
  if (testDbUrl) {
    await dropWorkerDatabase(testDbUrl)
  }
})

// Provide the env vars `@/server/env` requires at module-load time.
import './_helpers/env'

// Seed the in-process settings snapshot once per worker by writing
// directly to the shared cross-module slot. Importing through
// `@/server/domains/settings/snapshot` would transitively load
// `@/server/infra/db/operations/setting` here, and Vitest does not re-mock modules
// imported from a setup file (they're already cached by the time a
// test file's `vi.mock(...)` is hoisted) — so reaching for the slot
// from `@/shared/config/blog` keeps the DB query module unloaded until
// individual test files decide to either mock it or load it. Tests
// that need to clear or replace the snapshot before each `it` should
// call `setBlogSettingsBundleForTests(...)` from
// `@/server/domains/settings/snapshot` themselves.
BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(Promise.resolve(TEST_BLOG_SETTINGS_BUNDLE))
