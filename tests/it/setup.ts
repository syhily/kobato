// Vitest worker setup: one in-memory SQLite per test file; file-backed
// flows opt in via `createTestDatabaseFile`. The `:memory:` choice is
// owned by `#/_helpers/env` (imported before `@/server/infra/config`).

import { afterEach } from 'vitest'

import '#/_helpers/env'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
