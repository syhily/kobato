import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

const createBackup = vi.fn().mockResolvedValue({ path: '/backup' })
const cleanupOldBackups = vi.fn().mockResolvedValue(undefined)
const checkPgToolsAvailable = vi.fn().mockResolvedValue(undefined)
const registerShutdownHook = vi.fn()
const getDb = vi.fn().mockReturnValue({})

vi.mock('@/server/domains/backup/services/backup', () => ({
  createBackup: (...args: unknown[]) => createBackup(...args),
  cleanupOldBackups: (...args: unknown[]) => cleanupOldBackups(...args),
}))

vi.mock('@/server/bootstrap/db-lifecycle', () => ({
  getDb: (...args: unknown[]) => getDb(...args),
}))

vi.mock('@/server/domains/backup/services/shared', () => ({
  checkPgToolsAvailable: (...args: unknown[]) => checkPgToolsAvailable(...args),
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => logger),
}))

let bundle: Record<string, unknown> | null = null
vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(() => bundle),
}))

vi.mock('@/server/infra/scheduler-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/scheduler-utils')>()
  return {
    ...actual,
    computeNextRun: vi.fn((_settings, _tz, now) => new Date(now.getTime() + 3_600_000)),
  }
})

const { scheduleNextBackup, rescheduleBackup } = await import('@/server/domains/backup/scheduler')
const { stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')

// The scheduleJob seam registers its stop-all hook once, at module
// import — capture it here, before beforeEach clears the mock.
const sharedJobStopHook = registerShutdownHook.mock.calls[0]?.[0] as (() => void | Promise<void>) | undefined

describe('backup scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bundle = null
    stopAllScheduledJobs()
  })

  afterEach(() => {
    stopAllScheduledJobs()
  })

  it('retries when settings are not hydrated', () => {
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('never runs the backup when scheduled backup is disabled', async () => {
    bundle = {
      backup: { scheduled: { enabled: false }, retention: { enabled: false } },
      assets: { storage: { enabled: true } },
    }
    scheduleNextBackup()
    // Suspended: the seam arms only its re-evaluation retry — the backup
    // job itself never fires, even far past the retry window.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(createBackup).not.toHaveBeenCalled()
  })

  it('schedules and runs a backup job', async () => {
    bundle = {
      backup: { scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: true, days: 7 } },
      assets: { storage: { enabled: true } },
      siteIdentity: { timeZone: 'UTC' },
    }
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(createBackup).toHaveBeenCalled()
    expect(cleanupOldBackups).toHaveBeenCalledWith(expect.anything(), 7)
  })

  it('handles a next-run in the past by scheduling in one minute', async () => {
    const { computeNextRun } = await import('@/server/infra/scheduler-utils')
    ;(computeNextRun as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Date(Date.now() - 1000))
    bundle = {
      backup: { scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } },
      assets: { storage: { enabled: true } },
      siteIdentity: { timeZone: 'UTC' },
    }
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('resets retry attempt and reschedules on settings change', () => {
    bundle = {
      backup: { scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } },
      assets: { storage: { enabled: true } },
      siteIdentity: { timeZone: 'UTC' },
    }
    rescheduleBackup()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('stops the scheduler', () => {
    bundle = {
      backup: { scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } },
      assets: { storage: { enabled: true } },
      siteIdentity: { timeZone: 'UTC' },
    }
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBe(1)
    stopAllScheduledJobs()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('registers the shared job-stop shutdown hook at import', () => {
    // The scheduleJob seam registers one hook that stops every job.
    expect(sharedJobStopHook).toBeDefined()
  })

  it('stops the scheduler when the shared shutdown hook runs', async () => {
    bundle = {
      backup: { scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } },
      assets: { storage: { enabled: true } },
      siteIdentity: { timeZone: 'UTC' },
    }
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBe(1)
    await sharedJobStopHook?.()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('schedules a backup even when asset storage is disabled (local fallback)', () => {
    // Scheduled backups no longer require S3 — when storage is off they land
    // in local storage, so the scheduler still arms a timer.
    bundle = {
      backup: { scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } },
      assets: { storage: { enabled: false } },
      siteIdentity: { timeZone: 'UTC' },
    }
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('logs an error when a backup job fails', async () => {
    createBackup.mockRejectedValueOnce(new Error('dump failed'))
    bundle = {
      backup: { scheduled: { enabled: true, frequency: 'daily' }, retention: { enabled: false } },
      assets: { storage: { enabled: true } },
      siteIdentity: { timeZone: 'UTC' },
    }
    scheduleNextBackup()
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(logger.error).toHaveBeenCalled()
  })
})
