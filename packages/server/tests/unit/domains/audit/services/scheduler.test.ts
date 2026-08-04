import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const runArchiveJob = vi.fn().mockResolvedValue(undefined)
const registerShutdownHook = vi.fn()
const db = {}
const getDb = vi.fn().mockReturnValue(db)

vi.mock('@kobato/server/domains/audit/services/archive', () => ({
  runArchiveJob: (...args: unknown[]) => runArchiveJob(...args),
}))

vi.mock('@kobato/server/infra/lifecycle', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

// `computeNextRun` runs for real: the hydrated settings pin timeZone=UTC,
// and the fake timers make the 04:00 daily schedule deterministic — the
// next fire always lands within 24h, so advancing a full day + margin
// crosses exactly one fire.
const ADVANCE_TO_NEXT_RUN_MS = 86_400_000 + 1_000

const { scheduleNextArchive, rescheduleArchive, wireArchiveScheduler } =
  await import('@kobato/server/domains/audit/services/scheduler')
const { stopAllScheduledJobs } = await import('@kobato/server/infra/scheduler-utils')

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

    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
    expect(runArchiveJob).toHaveBeenCalledTimes(1)
    expect(runArchiveJob).toHaveBeenCalledWith(freshDb)
  })

  it('reschedules the next run after the job completes', async () => {
    seedHydratedSettings()
    scheduleNextArchive()
    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
    expect(runArchiveJob).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
    expect(runArchiveJob).toHaveBeenCalledTimes(2)
  })

  it('logs an error when the archive job fails', async () => {
    runArchiveJob.mockRejectedValueOnce(new Error('archive failed'))
    seedHydratedSettings()
    scheduleNextArchive()
    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
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
