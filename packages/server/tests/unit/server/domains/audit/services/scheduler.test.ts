import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/test/blog-settings.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const runArchiveJob = vi.fn().mockResolvedValue(undefined)
const registerShutdownHook = vi.fn()
const db = {}

vi.mock('@kobato/server/domains/audit/services/archive.ts', () => ({
  runArchiveJob: (...args: unknown[]) => runArchiveJob(...args),
}))

vi.mock('@kobato/server/infra/lifecycle.ts', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

// `computeNextRun` runs for real: UTC settings plus fake timers make the 04:00 schedule
// deterministic, so one day + margin crosses exactly one fire.
const ADVANCE_TO_NEXT_RUN_MS = 86_400_000 + 1_000

const { rescheduleArchive } = await import('@kobato/server/domains/audit/services/scheduler.ts')
const { scheduleRegisteredJob, setJobHandleGetter } = await import('@kobato/server/infra/job-registry.ts')
const { stopAllScheduledJobs } = await import('@kobato/server/infra/scheduler-utils.ts')

// The registry owns the shared db getter; a bare handle shape suffices —
// the job reads only `.db` at fire time.
let currentDb = db
setJobHandleGetter({ getDatabaseHandle: () => ({ db: currentDb }) as never })

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
    currentDb = db
    setBlogSettingsBundleForTests(null)
    stopAllScheduledJobs()
  })

  afterEach(() => {
    stopAllScheduledJobs()
  })

  it('retries shortly when settings are not hydrated', () => {
    scheduleRegisteredJob('audit.scheduler')
    expect(vi.getTimerCount()).toBe(1)
    expect(runArchiveJob).not.toHaveBeenCalled()
  })

  it('schedules the next 04:00 run when settings are hydrated', () => {
    seedHydratedSettings()
    scheduleRegisteredJob('audit.scheduler')
    expect(vi.getTimerCount()).toBe(1)
    expect(runArchiveJob).not.toHaveBeenCalled()
  })

  it('runs the archive job with the lazily-resolved db when the timer fires', async () => {
    seedHydratedSettings()
    scheduleRegisteredJob('audit.scheduler')

    // The db is read at fire time, not captured at schedule time — a
    // recreated pool (restore completion) is picked up.
    const freshDb = {}
    currentDb = freshDb

    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
    expect(runArchiveJob).toHaveBeenCalledTimes(1)
    expect(runArchiveJob).toHaveBeenCalledWith(freshDb)
  })

  it('reschedules the next run after the job completes', async () => {
    seedHydratedSettings()
    scheduleRegisteredJob('audit.scheduler')
    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
    expect(runArchiveJob).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(ADVANCE_TO_NEXT_RUN_MS)
    expect(runArchiveJob).toHaveBeenCalledTimes(2)
  })

  it('logs an error when the archive job fails', async () => {
    runArchiveJob.mockRejectedValueOnce(new Error('archive failed'))
    seedHydratedSettings()
    scheduleRegisteredJob('audit.scheduler')
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
    scheduleRegisteredJob('audit.scheduler')
    expect(vi.getTimerCount()).toBe(1)
    stopAllScheduledJobs()
    expect(vi.getTimerCount()).toBe(0)
  })
})
