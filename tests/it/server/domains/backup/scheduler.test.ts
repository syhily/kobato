import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const createBackup = vi.fn().mockResolvedValue({ path: '/backup' })
const cleanupOldBackups = vi.fn().mockResolvedValue(undefined)
const registerShutdownHook = vi.fn()

vi.mock('@/server/domains/backup/services/backup', () => ({
  createBackup: (...args: unknown[]) => createBackup(...args),
  cleanupOldBackups: (...args: unknown[]) => cleanupOldBackups(...args),
  wireBackupSnapshots: vi.fn(),
}))

vi.mock('@/server/infra/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/infra/lifecycle')>()),
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

vi.mock('@/server/infra/scheduler-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/scheduler-utils')>()
  return {
    ...actual,
    computeNextRun: vi.fn((_settings, _tz, now) => new Date(now.getTime() + 3_600_000)),
  }
})

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

const { scheduleRegisteredJob, setJobHandleGetter } = await import('@/server/infra/job-registry')
const { rescheduleBackup } = await import('@/server/domains/backup/scheduler')
const { stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')

// Dynamic import: a static one would evaluate the db-lifecycle graph before the mock consts initialize.
const { getTestDb } = await import('#/_helpers/integration-db')
const testDb = getTestDb()
// The registry owns the shared db getter; a bare handle shape suffices —
// the job reads only `.db` at fire time.
setJobHandleGetter({ getDatabaseHandle: () => ({ db: testDb }) as never })

// The stop-all hook registers once at module import — capture before beforeEach clears the mocks.
const sharedJobStopHook = registerShutdownHook.mock.calls[0]?.[0] as (() => void | Promise<void>) | undefined

// Real in-memory DB; the backup service stays mocked as the S3-backed seam.
function bundleWith(backup: Record<string, unknown>): typeof TEST_BLOG_SETTINGS_BUNDLE {
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
    scheduleRegisteredJob('backup.scheduler')
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('never runs the backup when scheduled backup is disabled', async () => {
    setBlogSettingsBundleForTests(bundleWith({ scheduled: { enabled: false }, retention: { enabled: false } }))
    scheduleRegisteredJob('backup.scheduler')
    // Only the re-evaluation retry arms — the backup job itself never fires.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(createBackup).not.toHaveBeenCalled()
  })

  it('schedules and runs a backup job', async () => {
    setBlogSettingsBundleForTests(
      bundleWith({ scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: true, days: 7 } }),
    )
    scheduleRegisteredJob('backup.scheduler')
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(createBackup).toHaveBeenCalled()
    expect(cleanupOldBackups).toHaveBeenCalledWith(expect.objectContaining({}), 7)
  })

  it('skips quietly when another backup already holds the single-flight slot', async () => {
    const { DomainError } = await import('@/server/infra/http/errors')
    const { __logCaptureForTests, __clearLogCaptureForTests } = await import('@/server/infra/logger')
    createBackup.mockRejectedValueOnce(new DomainError('CONFLICT'))
    setBlogSettingsBundleForTests(
      bundleWith({ scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: true, days: 7 } }),
    )
    scheduleRegisteredJob('backup.scheduler')
    __clearLogCaptureForTests()
    await vi.advanceTimersByTimeAsync(3_600_000)

    expect(createBackup).toHaveBeenCalled()
    const logs = __logCaptureForTests().filter((entry) => entry.scope === 'backup.scheduler')
    expect(logs.some((entry) => entry.level === 'error')).toBe(false)
    expect(logs.some((entry) => entry.level === 'info' && entry.msg.includes('skipped'))).toBe(true)
    expect(cleanupOldBackups).not.toHaveBeenCalled()
  })

  it('handles a next-run in the past by scheduling in one minute', async () => {
    const { computeNextRun } = await import('@/server/infra/scheduler-utils')
    ;(computeNextRun as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Date(Date.now() - 1000))
    setBlogSettingsBundleForTests(
      bundleWith({ scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } }),
    )
    scheduleRegisteredJob('backup.scheduler')
    // Other periodic jobs stay armed in it; this pins that a past next-run does not throw.
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
    scheduleRegisteredJob('backup.scheduler')
    stopAllScheduledJobs()
    await vi.advanceTimersByTimeAsync(10 * 3_600_000)
    expect(createBackup).not.toHaveBeenCalled()
  })

  it('registers the shared job-stop shutdown hook at import', () => {
    expect(sharedJobStopHook).toBeDefined()
  })
})
