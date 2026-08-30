// Vitest worker setup: one in-memory SQLite per test file; file-backed
// flows opt in via `createTestDatabaseFile`. The `:memory:` choice is
// owned by `#/_helpers/env` (imported before `@/server/infra/config`).

// Run the suite against Zod 4.5's compiled parsers, mirroring production
// (`src/entry.server.tsx`); node tests never set `jitless` (browser-only).
import 'zod/compile'
import { afterEach } from 'vitest'

import '#/_helpers/env'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
