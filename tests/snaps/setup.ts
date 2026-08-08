// Vitest worker setup for snapshot tests — no DB, just env vars + the settings snapshot slot.

import { afterEach, vi } from 'vitest'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import '#/_helpers/env'

// Inert global stubs for the noisiest UI seams; setup stubs the noise,
// `tests/_helpers/` owns the doubles (a file-level vi.mock overrides these).
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  // Without this export the mocked module would resolve Toaster to undefined and break AdminShell renders.
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

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
