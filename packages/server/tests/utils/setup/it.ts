import '@kobato/test/setup/it'
import { setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query'
import { __resetSetupTokenForTests } from '@kobato/server/domains/auth/setup-token'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { afterAll, afterEach } from 'vitest'

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  setAnalyticsQueryExecutor(null)
  __resetSetupTokenForTests()
})

afterAll(async () => {
  try {
    const { invalidateMailTransportCache } = await import('@kobato/server/infra/email/sender')
    const { __resetSchedulerTaskStatesForTests, stopAllScheduledJobs } =
      await import('@kobato/server/infra/scheduler-utils')
    stopAllScheduledJobs()
    __resetSchedulerTaskStatesForTests()
    invalidateMailTransportCache()
  } catch {}
})
