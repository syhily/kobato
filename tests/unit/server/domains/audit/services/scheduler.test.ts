import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

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

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => logger),
}))

let bundle: Record<string, unknown> | null = null
vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(() => bundle),
}))

vi.mock('@/server/infra/scheduler-utils', () => ({
  computeNextRun: vi.fn((_settings, _tz, now: Date) => new Date(now.getTime() + 3_600_000)),
}))

const { scheduleNextArchive, rescheduleArchive, stopArchiveScheduler, wireArchiveScheduler } =
  await import('@/server/domains/audit/services/scheduler')

describe('audit scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDb.mockReturnValue(db)
    bundle = null
    stopArchiveScheduler()
    wireArchiveScheduler({ getDb })
  })

  afterEach(() => {
    stopArchiveScheduler()
  })

  it('retries shortly when settings are not hydrated', () => {
    scheduleNextArchive()
    expect(vi.getTimerCount()).toBe(1)
    expect(runArchiveJob).not.toHaveBeenCalled()
  })

  it('schedules the next 04:00 run when settings are hydrated', () => {
    bundle = { siteIdentity: { timeZone: 'UTC' } }
    scheduleNextArchive()
    expect(vi.getTimerCount()).toBe(1)
    expect(runArchiveJob).not.toHaveBeenCalled()
  })

  it('runs the archive job with the lazily-resolved db when the timer fires', async () => {
    bundle = { siteIdentity: { timeZone: 'UTC' } }
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
    bundle = { siteIdentity: { timeZone: 'UTC' } }
    scheduleNextArchive()
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(runArchiveJob).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(runArchiveJob).toHaveBeenCalledTimes(2)
  })

  it('logs an error when the archive job fails', async () => {
    runArchiveJob.mockRejectedValueOnce(new Error('archive failed'))
    bundle = { siteIdentity: { timeZone: 'UTC' } }
    scheduleNextArchive()
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(logger.error).toHaveBeenCalled()
  })

  it('reschedules on settings change', () => {
    bundle = { siteIdentity: { timeZone: 'UTC' } }
    rescheduleArchive()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('stops the scheduler', () => {
    bundle = { siteIdentity: { timeZone: 'UTC' } }
    scheduleNextArchive()
    expect(vi.getTimerCount()).toBe(1)
    stopArchiveScheduler()
    expect(vi.getTimerCount()).toBe(0)
  })
})
