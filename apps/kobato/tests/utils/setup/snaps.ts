import '@kobato/test/setup/snaps'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { afterEach, vi } from 'vitest'

vi.mock('@kobato/web-admin/ui/settings/use-settings-mutation', async () => {
  const { settingsMutationMock } = await import('@kobato/web-admin/tests/utils/settings-mutation-mock')
  return { useSettingsMutation: settingsMutationMock }
})

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  vi.useRealTimers()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
