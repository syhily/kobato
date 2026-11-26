import '@kobato/test/setup/snaps'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { installWebStreamGlobals } from '@kobato/test/web-streams'
import { afterEach } from 'vitest'

installWebStreamGlobals()

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
