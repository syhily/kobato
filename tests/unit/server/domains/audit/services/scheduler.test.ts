import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

vi.useFakeTimers()

const runArchiveJob = vi.fn().mockResolvedValue(undefined)
const registerShutdownHook = vi.fn()
const db = {}
const getDb = vi.fn().mockReturnValue(db)

vi.mock('@/server/domains/audit/services/archive', () => ({
  runArchiveJob: (...args: unknown[]) => runArchiveJob(...args),
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

vi.mock('@/server/infra/scheduler-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/scheduler-utils')>()
  return {
    ...actual,
    computeNextRun: vi.fn((_settings, _tz, now: Date) => new Date(now.getTime() + 3_600_000)),
  }
})

const { scheduleNextArchive, rescheduleArchive, wireArchiveScheduler } =
  await import('@/server/domains/audit/services/scheduler')
const { stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')

/** Hydrate the real settings snapshot with the timeZone the scheduler reads. */
function seedHydratedSettings() {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, timeZone: 'UTC' },
  })
}

describe('audit scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __clearLogCaptureForTests()
    getDb.mockReturnValue(db)
    setBlogSettingsBundleForTests(null)
    stopAllScheduledJobs()
    wireArchiveScheduler({ getDb })
  })

  afterEach(() => {
    stopAllScheduledJobs()
  })

  it('retries shortly when settings are not hydrated', () => {
    scheduleNextArchive()
    expect(vi.getTimerCount()).toBe(1)
    expect(runArchiveJob).not.toHaveBeenCalled()
  })

  it('schedules the next 04:00 run when settings are hydrated', () => {
    seedHydratedSettings()
    scheduleNextArchive()
    expect(vi.getTimerCount()).toBe(1)
    expect(runArchiveJob).not.toHaveBeenCalled()
  })

  it('runs the archive job with the lazily-resolved db when the timer fires', async () => {
    seedHydratedSettings()
    scheduleNextArchive()

    // The db is read via getDb() at fire time, not captured at schedule
    // time — a recreated pool (restore completion) is picked up.
    const freshDb = {}
    getDb.mockReturnValue(freshDb)

    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(runArchiveJob).toHaveBeenCalledTimes(1)
    expect(runArchiveJob).toHaveBeenCalledWith(freshDb)
  })

  it('reschedules the next run after the job completes', async () => {
    seedHydratedSettings()
    scheduleNextArchive()
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(runArchiveJob).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(runArchiveJob).toHaveBeenCalledTimes(2)
  })

  it('logs an error when the archive job fails', async () => {
    runArchiveJob.mockRejectedValueOnce(new Error('archive failed'))
    seedHydratedSettings()
    scheduleNextArchive()
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(__logCaptureForTests().some((e) => e.level === 'error')).toBe(true)
  })

  it('reschedules on settings change', () => {
    seedHydratedSettings()
    rescheduleArchive()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('stops the scheduler', () => {
    seedHydratedSettings()
    scheduleNextArchive()
    expect(vi.getTimerCount()).toBe(1)
    stopAllScheduledJobs()
    expect(vi.getTimerCount()).toBe(0)
  })
})
