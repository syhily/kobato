// Vitest worker setup for snapshot tests. No DB — just env vars and
// the settings snapshot slot.

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

import { afterEach, vi } from 'vitest'
import '#/_helpers/env'

// Inert global stubs for the two noisiest UI seams. Convention: setup stubs
// the noise, `tests/_helpers/` owns the doubles — a test file only declares
// its own `vi.mock` for these modules when it ASSERTS on `toast` or programs
// `commit` (a file-level `vi.mock` overrides these registrations).
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  // `AdminShell` renders `<Toaster />`; without this export the mocked module
  // would resolve it to `undefined` and break any render that includes the shell.
  Toaster: () => null,
}))
vi.mock('@kobato/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit: vi.fn(),
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
