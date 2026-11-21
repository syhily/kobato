import '@kobato/test/setup/unit'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { afterEach, vi } from 'vitest'

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  vi.useRealTimers()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
