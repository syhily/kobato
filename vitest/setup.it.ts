// Vitest worker setup for integration tests. No server, no docker: the
// worker's database is a single in-memory SQLite instance (per test
// FILE — vitest isolates module graphs), so integration tests behave
// like unit tests with a real engine. File-backed flows (backup /
// restore) opt into temp files explicitly via `createTestDatabaseFile`.
// The `:memory:` choice itself is owned by `#/_helpers/env` (imported
// below — it lands before `@kobato/server/infra/config` can evaluate).

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
// Provide the env defaults `@kobato/server/infra/config` requires at
// module-load time.
import '#/_helpers/env'

import { afterEach } from 'vitest'

// Seed the in-process settings snapshot once per worker.
setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
