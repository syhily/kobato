import '@kobato/test/setup/unit'
import { setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { afterAll, afterEach, vi } from 'vitest'

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  vi.useRealTimers()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  setAnalyticsQueryExecutor(null)
})

afterAll(async () => {
  try {
    const { __resetSchedulerTaskStatesForTests, stopAllScheduledJobs } =
      await import('@kobato/server/infra/scheduler-utils')
    stopAllScheduledJobs()
    __resetSchedulerTaskStatesForTests()
  } catch {}
})
