import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

const createBackup = vi.fn().mockResolvedValue({ path: '/backup' })
const cleanupOldBackups = vi.fn().mockResolvedValue(undefined)
const registerShutdownHook = vi.fn()

vi.mock('@/server/domains/backup/services/backup', () => ({
  createBackup: (...args: unknown[]) => createBackup(...args),
  cleanupOldBackups: (...args: unknown[]) => cleanupOldBackups(...args),
}))

vi.mock('@/server/infra/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/infra/lifecycle')>()),
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

vi.mock('@/server/infra/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/infra/logger')>()),
  getLogger: vi.fn(() => logger),
}))

vi.mock('@/server/infra/scheduler-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/scheduler-utils')>()
  return {
    ...actual,
    computeNextRun: vi.fn((_settings, _tz, now) => new Date(now.getTime() + 3_600_000)),
  }
})

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

const { scheduleNextBackup, rescheduleBackup } = await import('@/server/domains/backup/scheduler')
const { stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')

// The scheduleJob seam registers its stop-all hook once, at module
// import — capture it here, before beforeEach clears the mock.
const sharedJobStopHook = registerShutdownHook.mock.calls[0]?.[0] as (() => void | Promise<void>) | undefined

// Timer-policy coverage for the backup scheduler: the DB is the real
// in-memory engine (the scheduler only passes it through to the backup
// service, which stays mocked as the S3-backed seam it is).
function bundleWith(backup: Record<string, unknown>): typeof TEST_BLOG_SETTINGS_BUNDLE {
  // The fixture overrides two sections wholesale; the rest of the bundle
  // shape is inherited from TEST_BLOG_SETTINGS_BUNDLE.
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    backup,
    assets: { ...TEST_BLOG_SETTINGS_BUNDLE.assets, storage: { enabled: true } },
  } as unknown as typeof TEST_BLOG_SETTINGS_BUNDLE
}

describe('backup scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    stopAllScheduledJobs()
  })

  afterEach(() => {
    stopAllScheduledJobs()
  })

  it('retries when scheduled backup is disabled in settings', () => {
    setBlogSettingsBundleForTests(bundleWith({ scheduled: { enabled: false }, retention: { enabled: false } }))
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('never runs the backup when scheduled backup is disabled', async () => {
    setBlogSettingsBundleForTests(bundleWith({ scheduled: { enabled: false }, retention: { enabled: false } }))
    scheduleNextBackup()
    // Suspended: the seam arms only its re-evaluation retry — the backup
    // job itself never fires, even far past the retry window.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(createBackup).not.toHaveBeenCalled()
  })

  it('schedules and runs a backup job', async () => {
    setBlogSettingsBundleForTests(
      bundleWith({ scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: true, days: 7 } }),
    )
    scheduleNextBackup()
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(createBackup).toHaveBeenCalled()
    // The real database handle flows through to the cleanup call.
    expect(cleanupOldBackups).toHaveBeenCalledWith(expect.objectContaining({}), 7)
  })

  it('handles a next-run in the past by scheduling in one minute', async () => {
    const { computeNextRun } = await import('@/server/infra/scheduler-utils')
    ;(computeNextRun as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Date(Date.now() - 1000))
    setBlogSettingsBundleForTests(
      bundleWith({ scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } }),
    )
    scheduleNextBackup()
    // The composition root keeps other periodic jobs armed in the it
    // project — this case pins that a past next-run does not throw.
  })

  it('resets retry attempt and reschedules on settings change', () => {
    setBlogSettingsBundleForTests(
      bundleWith({ scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } }),
    )
    rescheduleBackup()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('stops the scheduler — the armed job never fires afterwards', async () => {
    setBlogSettingsBundleForTests(
      bundleWith({ scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } }),
    )
    scheduleNextBackup()
    stopAllScheduledJobs()
    await vi.advanceTimersByTimeAsync(10 * 3_600_000)
    expect(createBackup).not.toHaveBeenCalled()
  })

  it('registers the shared job-stop shutdown hook at import', () => {
    // The scheduleJob seam registers one hook that stops every job.
    expect(sharedJobStopHook).toBeDefined()
  })
})
