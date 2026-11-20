import '@kobato/test/setup/unit.ts'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/web-tests/utils/blog-settings.ts'
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web'
import { afterEach, vi } from 'vitest'

// The project runs on the vmThreads pool: each file gets a fresh VM context
// that does not inherit Node's web-stream globals (undici's webidl requires
// them at import time).
if (globalThis.ReadableStream === undefined) {
  globalThis.ReadableStream = ReadableStream as unknown as typeof globalThis.ReadableStream
  globalThis.WritableStream = WritableStream as unknown as typeof globalThis.WritableStream
  globalThis.TransformStream = TransformStream as unknown as typeof globalThis.TransformStream
}

vi.mock('@kobato/web-admin/ui/settings/use-settings-mutation.ts', () => ({
  useSettingsMutation: () => ({
    commit: vi.fn(),
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
