import '@kobato/test/setup/unit'
import { setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { afterAll, afterEach } from 'vitest'

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  setAnalyticsQueryExecutor(null)
})

afterAll(async () => {
  try {
    const { __resetSchedulerTaskStatesForTests, stopAllScheduledJobs } =
      await import('@kobato/server/infra/scheduler-utils')
    stopAllScheduledJobs()
    __resetSchedulerTaskStatesForTests()
  } catch {
    // Isolated files may partially mock scheduler-utils' import graph; a
    // shared worker never mocks, so the cleanup net only matters there.
  }
})
