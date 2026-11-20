import '@kobato/test/setup/it.ts'
import { setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query.ts'
import { __resetSetupTokenForTests } from '@kobato/server/domains/auth/setup-token.ts'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/server/tests/utils/blog-settings.ts'
import { afterAll, afterEach } from 'vitest'

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  setAnalyticsQueryExecutor(null)
  __resetSetupTokenForTests()
})

afterAll(async () => {
  try {
    const { invalidateMailTransportCache } = await import('@kobato/server/infra/email/sender.ts')
    const { __resetSchedulerTaskStatesForTests, stopAllScheduledJobs } =
      await import('@kobato/server/infra/scheduler-utils.ts')
    stopAllScheduledJobs()
    __resetSchedulerTaskStatesForTests()
    invalidateMailTransportCache()
  } catch {
    // Isolated files may partially mock this import graph; a shared worker
    // never mocks, so the cleanup net only matters there.
  }
})
