// Vitest worker setup for integration tests. No server, no docker: the
// worker's database is a single in-memory SQLite instance (per test
// FILE — vitest isolates module graphs), so integration tests behave
// like unit tests with a real engine. File-backed flows (backup /
// restore) opt into temp files explicitly via `createTestDatabaseFile`.

// The in-memory database choice MUST land before any import that could
// evaluate `@/server/infra/config` — the config module freezes
// `storage.database` at first load. `:memory:` is per-connection, and
// the harness returns the lifecycle global (`getDatabaseHandle`) so the
// whole file shares exactly one database; db-lifecycle migrates it at
// import.
process.env.storage__database = ':memory:'

import { afterEach } from 'vitest'

// Provide the env defaults `@/server/infra/config` requires at
// module-load time.
import '#/_helpers/env'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

// Seed the in-process settings snapshot once per worker.
setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
