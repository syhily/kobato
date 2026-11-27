import '@kobato/test/setup/node'
import { setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { installWebStreamGlobals } from '@kobato/test/web-streams'
import { afterAll, afterEach } from 'vitest'

installWebStreamGlobals()
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
  } catch {}
})
