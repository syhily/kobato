// Vitest worker setup for unit tests. No DB — just env vars and
// the settings snapshot slot so tests that import server modules can resolve.
//
// Also registers @testing-library/jest-dom matchers + auto-cleanup for
// tests that use @testing-library/react (via per-file `@vitest-environment
// happy-dom`). These are no-ops for Node-environment tests.

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
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
