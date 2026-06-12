import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPool = { totalCount: 0, idleCount: 0 } as unknown as Pool
const freshDb = { $client: mockPool } as unknown as NodePgDatabase

const mocks = vi.hoisted(() => ({
  drizzle: vi.fn(() => freshDb),
  runArchiveJob: vi.fn().mockResolvedValue(undefined),
  registerShutdownHook: vi.fn(),
  getBlogSettingsBundleSync: vi.fn(() => ({ limits: {} })),
}))

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: mocks.drizzle,
}))

vi.mock('@/server/domains/audit/services/archive', () => ({
  runArchiveJob: mocks.runArchiveJob,
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: mocks.registerShutdownHook,
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}))

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: mocks.getBlogSettingsBundleSync,
}))

describe('server/domains/audit/services/scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.drizzle.mockReturnValue(freshDb)
    mocks.runArchiveJob.mockResolvedValue(undefined)
  })

  it('does not retain a Drizzle transaction object and creates a fresh DB when the timer fires', async () => {
    vi.useFakeTimers()
    vi.resetModules()

    const { scheduleNextArchive } = await import('@/server/domains/audit/services/scheduler')

    scheduleNextArchive(mockPool)

    // No DB should be created and no archive job should run before the timer fires.
    expect(mocks.drizzle).not.toHaveBeenCalled()
    expect(mocks.runArchiveJob).not.toHaveBeenCalled()

    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setHours(4, 0, 0, 0)
    if (nextRun.getTime() <= now.getTime()) {
      nextRun.setDate(nextRun.getDate() + 1)
    }
    const delayMs = nextRun.getTime() - now.getTime()

    await vi.advanceTimersByTimeAsync(delayMs)

    expect(mocks.drizzle).toHaveBeenCalledTimes(1)
    expect(mocks.drizzle).toHaveBeenCalledWith({ client: mockPool })
    expect(mocks.runArchiveJob).toHaveBeenCalledTimes(1)
    expect(mocks.runArchiveJob).toHaveBeenCalledWith(freshDb, mockPool)

    vi.useRealTimers()
  })
})
