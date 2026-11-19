// Run the suite against Zod 4.5's compiled parsers, mirroring production
// (`src/entry.server.tsx`); node tests never set `jitless` (browser-only).
import 'zod/compile'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { silenceLocalStorageWarning } from '@kobato/test/silence-local-storage-warning.ts'
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

silenceLocalStorageWarning()
setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
