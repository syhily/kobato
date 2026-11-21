import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createBackup = vi.fn().mockResolvedValue({ path: '/backup' })
const cleanupOldBackups = vi.fn().mockResolvedValue(undefined)
const registerShutdownHook = vi.fn()

vi.mock('@kobato/server/domains/backup/services/backup.ts', () => ({
  createBackup: (...args: unknown[]) => createBackup(...args),
  cleanupOldBackups: (...args: unknown[]) => cleanupOldBackups(...args),
  wireBackupSnapshots: vi.fn(),
  wireBackupEncryption: vi.fn(),
}))

vi.mock('@kobato/server/infra/lifecycle.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kobato/server/infra/lifecycle.ts')>()),
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

vi.mock('@kobato/server/infra/scheduler-utils.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/infra/scheduler-utils.ts')>()
  return {
    ...actual,
    computeNextRun: vi.fn((_settings, _tz, now) => new Date(now.getTime() + 3_600_000)),
  }
})

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings.ts'

const { scheduleRegisteredJob, setJobHandleGetter } = await import('@kobato/server/infra/job-registry.ts')
const { rescheduleBackup } = await import('@kobato/server/domains/backup/scheduler.ts')
const { stopAllScheduledJobs } = await import('@kobato/server/infra/scheduler-utils.ts')

const { getTestDb } = await import('@kobato/server/tests/utils/integration-db.ts')
const testDb = getTestDb()
setJobHandleGetter({ getDatabaseHandle: () => ({ db: testDb }) as never })

const sharedJobStopHook = registerShutdownHook.mock.calls[0]?.[0] as (() => void | Promise<void>) | undefined

function bundleWith(backup: Record<string, unknown>): typeof TEST_BLOG_SETTINGS_BUNDLE {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    backup,
    assets: { ...TEST_BLOG_SETTINGS_BUNDLE.assets, storage: { enabled: true } },
  } as unknown as typeof TEST_BLOG_SETTINGS_BUNDLE
}

describe('backup scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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

  it('never runs the backup while settings are not hydrated', async () => {
    setBlogSettingsBundleForTests(undefined)
    scheduleRegisteredJob('backup.scheduler')
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(createBackup).not.toHaveBeenCalled()
  })

  it('never runs the backup when scheduled backup is disabled', async () => {
    setBlogSettingsBundleForTests(bundleWith({ scheduled: { enabled: false }, retention: { enabled: false } }))
    scheduleRegisteredJob('backup.scheduler')
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
    const { DomainError } = await import('@kobato/server/infra/http/errors.ts')
    const { __logCaptureForTests, __clearLogCaptureForTests } = await import('@kobato/server/infra/logger.ts')
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
    const { computeNextRun } = await import('@kobato/server/infra/scheduler-utils.ts')
    ;(computeNextRun as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Date(Date.now() - 1000))
    setBlogSettingsBundleForTests(
      bundleWith({ scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } }),
    )
    scheduleRegisteredJob('backup.scheduler')
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
