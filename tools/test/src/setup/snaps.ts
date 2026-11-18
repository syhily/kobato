// Vitest worker setup for snapshot tests — no DB, just env vars + the settings snapshot slot.

// Run the suite against Zod 4.5's compiled parsers, mirroring production
// (`src/entry.server.tsx`); node tests never set `jitless` (browser-only).
import 'zod/compile'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { silenceLocalStorageWarning } from '@kobato/test/silence-local-storage-warning.ts'
import '@kobato/test/env.ts'
import { afterEach, vi } from 'vitest'

// Inert global stubs for the noisiest UI seams; setup stubs the noise,
// `@kobato/test` owns the doubles (a file-level vi.mock overrides these).
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  // Without this export the mocked module would resolve Toaster to undefined and break AdminShell renders.
  Toaster: () => null,
}))
vi.mock('@kobato/web-admin/ui/settings/useSettingsMutation.ts', () => ({
  useSettingsMutation: () => ({
    commit: vi.fn(),
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

silenceLocalStorageWarning()
setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
