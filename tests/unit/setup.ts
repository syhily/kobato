// Test bootstrap: no DB — env vars + settings snapshot slot so server-module
// imports resolve; jest-dom matchers + RTL auto-cleanup for happy-dom tests
// (no-ops otherwise).

// Run the suite against Zod 4.5's compiled parsers, mirroring production
// (`src/entry.server.tsx`); node tests never set `jitless` (browser-only).
import 'zod/compile'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
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

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import '#/_helpers/env'

// Inert stubs; a file-level vi.mock overrides them when a test asserts on them.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  // `AdminShell` renders `<Toaster />`, so the mock must export it.
  Toaster: () => null,
}))
vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit: vi.fn(),
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot + DOM after every test to prevent isolation leaks.
afterEach(() => {
  cleanup()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
