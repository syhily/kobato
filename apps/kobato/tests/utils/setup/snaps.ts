import '@kobato/test/setup/snaps'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { afterEach, vi } from 'vitest'

vi.mock('@/ui/settings/use-settings-mutation', async () => {
  const { settingsMutationMock } = await import('@tests/utils/settings-mutation-mock')
  return { useSettingsMutation: settingsMutationMock }
})

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
