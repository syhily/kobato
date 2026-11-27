import '@kobato/test/setup/dom'
import { setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { installWebStreamGlobals } from '@kobato/test/web-streams'
import { afterEach, vi } from 'vitest'

vi.mock('@/ui/settings/use-settings-mutation', async () => {
  const { settingsMutationMock } = await import('@tests/utils/settings-mutation-mock')
  return { useSettingsMutation: settingsMutationMock }
})

installWebStreamGlobals()
setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  setAnalyticsQueryExecutor(null)
})
