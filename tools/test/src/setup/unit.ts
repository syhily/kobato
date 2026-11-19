// Run the suite against Zod 4.5's compiled parsers, mirroring production
// (`src/entry.server.tsx`); node tests never set `jitless` (browser-only).
import 'zod/compile'
import '@testing-library/jest-dom/vitest'
import { setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query.ts'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { silenceLocalStorageWarning } from '@kobato/test/silence-local-storage-warning.ts'
// Evaluate @date-fns/tz against the REAL Date constructor, before any test
// module calls `vi.useFakeTimers()`. `TZDateMini extends Date` binds whatever
// the global is at module-evaluation time; a test file that fakes timers and
// then dynamically imports scheduler code (the `scheduleJob` tests) would
// otherwise bind the fake Date, whose TZDate zone math silently falls back to
// the system timezone — computeNextRun then misfires when the system zone
// differs from the settings zone (CI runs TZ=UTC, the bundle pins
// Asia/Shanghai). Setup files evaluate first, so this import pins the real
// binding for every unit test file.
import '@date-fns/tz'
import { cleanup } from '@testing-library/react'
import '@kobato/test/env.ts'
import { afterEach, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}))
vi.mock('@kobato/web-admin/ui/settings/use-settings-mutation.ts', () => ({
  useSettingsMutation: () => ({
    commit: vi.fn(),
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))
// `safeFetch` resolves hostnames before dialing; tests stub `fetch`, so DNS
// must not depend on the machine's resolver (VPN/fake-IP setups answer every
// name with 198.18.0.0/15, which the SSRF blocklist correctly rejects).
// Hostnames default to one public address; a file-level mock overrides this.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

silenceLocalStorageWarning()
setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  cleanup()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  setAnalyticsQueryExecutor(null)
})
