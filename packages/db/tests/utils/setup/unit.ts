import '@kobato/test/setup/unit.ts'
import { setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query.ts'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings.ts'
import { afterEach } from 'vitest'

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  setAnalyticsQueryExecutor(null)
})
