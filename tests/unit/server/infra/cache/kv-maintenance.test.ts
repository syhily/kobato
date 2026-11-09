import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

const fileStoreMock = vi.hoisted(() => ({
  sweepBucket: vi.fn<(bucket: string, now?: number) => Promise<void>>(),
}))

vi.mock('@/server/infra/cache/file-store', () => fileStoreMock)

import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

vi.useFakeTimers()

const registerShutdownHook = vi.fn()

// Stub just enough of the Drizzle chain for `db.delete(table).where(…)`.
const where = vi.fn().mockResolvedValue(undefined)
const db = { delete: vi.fn(() => ({ where })) }

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: (...args: unknown[]) => registerShutdownHook(...args),
}))

const { scheduleRegisteredJob, setJobHandleGetter } = await import('@/server/infra/job-registry')
const { sweepExpiredKvEntries } = await import('@/server/infra/cache/kv-maintenance')
const { stopAllScheduledJobs } = await import('@/server/infra/scheduler-utils')
const { CACHE_DECLARATIONS } = await import('@/shared/cache/registry')

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

// The registry owns the shared db getter; a bare handle shape suffices —
// the job reads only `.db` at fire time.
let currentDb = db
setJobHandleGetter({ getDatabaseHandle: () => ({ db: currentDb }) as never })

describe('kv-maintenance scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __clearLogCaptureForTests()
    fileStoreMock.sweepBucket.mockResolvedValue(undefined)
    currentDb = db
    stopAllScheduledJobs()
  })

  afterEach(() => {
    stopAllScheduledJobs()
  })

  it('sweeps both auth tables and every cache bucket when the hourly timer fires', async () => {
    scheduleRegisteredJob('kv.maintenance')
    expect(vi.getTimerCount()).toBe(1)
    expect(db.delete).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    // one_time_token + session (cache entries are a filesystem leg).
    expect(db.delete).toHaveBeenCalledTimes(2)
    expect(fileStoreMock.sweepBucket).toHaveBeenCalledTimes(CACHE_DECLARATIONS.length)
  })

  it('resolves the db lazily at fire time, not at schedule time', async () => {
    scheduleRegisteredJob('kv.maintenance')

    // A recreated pool (restore completion) must be picked up.
    const freshDb = { delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }
    currentDb = freshDb

    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(freshDb.delete).toHaveBeenCalledTimes(2)
    expect(db.delete).not.toHaveBeenCalled()
  })

  it('reschedules the next sweep after each run', async () => {
    scheduleRegisteredJob('kv.maintenance')
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(db.delete).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(db.delete).toHaveBeenCalledTimes(4)
  })

  it('logs the error and still reschedules when the SQL sweep fails', async () => {
    where.mockRejectedValueOnce(new Error('sweep failed'))
    scheduleRegisteredJob('kv.maintenance')
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(__logCaptureForTests().some((e) => e.level === 'error')).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('stops the scheduler', () => {
    scheduleRegisteredJob('kv.maintenance')
    expect(vi.getTimerCount()).toBe(1)
    stopAllScheduledJobs()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('sweepExpiredKvEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __clearLogCaptureForTests()
    fileStoreMock.sweepBucket.mockResolvedValue(undefined)
  })

  it('issues one delete per auth table and sweeps every declared bucket', async () => {
    const localWhere = vi.fn().mockResolvedValue(undefined)
    const localDb = { delete: vi.fn(() => ({ where: localWhere })) }
    await sweepExpiredKvEntries(localDb as unknown as Database)
    expect(localDb.delete).toHaveBeenCalledTimes(2)
    expect(localWhere).toHaveBeenCalledTimes(2)
    expect(fileStoreMock.sweepBucket.mock.calls.map(([bucket]) => bucket)).toEqual(
      CACHE_DECLARATIONS.map((entry) => entry.id),
    )
  })

  it('isolates one failing bucket and still sweeps the rest', async () => {
    const failing = CACHE_DECLARATIONS[0]!.id
    fileStoreMock.sweepBucket.mockImplementation(async (bucket) => {
      if (bucket === failing) {
        throw new Error('bucket unreadable')
      }
    })
    const localDb = { delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }

    await expect(sweepExpiredKvEntries(localDb as unknown as Database)).resolves.toBeUndefined()
    expect(fileStoreMock.sweepBucket).toHaveBeenCalledTimes(CACHE_DECLARATIONS.length)
    expect(
      __logCaptureForTests().some(
        (entry) => entry.level === 'warn' && (entry.ctx as { bucket?: string } | undefined)?.bucket === failing,
      ),
    ).toBe(true)
  })
})
