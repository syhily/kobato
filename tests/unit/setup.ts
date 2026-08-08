// Test bootstrap: no DB — env vars + settings snapshot slot so server-module
// imports resolve; jest-dom matchers + RTL auto-cleanup for happy-dom tests
// (no-ops otherwise).

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

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
