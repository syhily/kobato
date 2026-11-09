// Vitest worker setup: one in-memory SQLite per test file; file-backed
// flows opt in via `createTestDatabaseFile`. The `:memory:` choice is
// owned by `#/_helpers/env` (imported before `@/server/infra/config`).

// Run the suite against Zod 4.5's compiled parsers, mirroring production
// (`src/entry.server.tsx`); node tests never set `jitless` (browser-only).
import 'zod/compile'
import { afterEach, vi } from 'vitest'

import '#/_helpers/env'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { silenceLocalStorageWarning } from '#/_helpers/silence-local-storage-warning'

silenceLocalStorageWarning()
setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// `safeFetch` resolves hostnames before dialing; suites stub `fetch`, so DNS
// must not depend on the machine's resolver (VPN/fake-IP setups answer every
// name with 198.18.0.0/15, which the SSRF blocklist correctly rejects).
// Hostnames default to one public address; a file-level mock overrides this.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
