import { beforeEach, describe, expect, it, vi } from 'vitest'

const poolMock = { id: 'pool' }
const dbMock = { id: 'db' }
let createDbPoolResult = { db: dbMock, pool: poolMock }

let restoreCallback: ((success: boolean, err?: Error) => Promise<void>) | null = null

const initAllBatchers = vi.fn()
const flushAllBatchers = vi.fn()
const resetAllBatchers = vi.fn()
const resetLikeTokenSweep = vi.fn()
const startLikeTokenSweep = vi.fn()
const migrateDatabase = vi.fn()
const scheduleNextArchive = vi.fn()
const refreshBlogSettings = vi.fn()
const restartServer = vi.fn()
const setRestartDb = vi.fn()
const setRestartRefreshSettings = vi.fn()
const closePool = vi.fn()
const registerShutdownHook = vi.fn((fn: () => unknown) => fn())
const registerRestoreComplete = vi.fn((cb: (success: boolean, err?: Error) => Promise<void>) => {
  restoreCallback = cb
})

vi.mock('@/server/infra/db/pool', () => ({
  createDbPool: vi.fn(() => createDbPoolResult),
  closePool: (...args: unknown[]) => closePool(...args),
}))

vi.mock('@/server/infra/db/migrate', () => ({
  migrateDatabase: (...args: unknown[]) => migrateDatabase(...args),
}))

vi.mock('@/server/infra/env', () => ({
  isVitest: () => true,
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: (fn: () => unknown) => registerShutdownHook(fn),
  registerRestoreComplete: (cb: (success: boolean, err?: Error) => Promise<void>) => registerRestoreComplete(cb),
  restartServer: (...args: unknown[]) => restartServer(...args),
  setRestartDb: (...args: unknown[]) => setRestartDb(...args),
  setRestartRefreshSettings: (...args: unknown[]) => setRestartRefreshSettings(...args),
}))

vi.mock('@/server/infra/logger', () => ({
  root: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock('@/server/infra/db/batcher-registry', () => ({
  initAllBatchers: (...args: unknown[]) => initAllBatchers(...args),
  flushAllBatchers: (...args: unknown[]) => flushAllBatchers(...args),
  resetAllBatchers: (...args: unknown[]) => resetAllBatchers(...args),
}))

// db-lifecycle imports the batcher modules only for their registration
// side effect; the mocked registry absorbs the lifecycle calls.
vi.mock('@/server/domains/analytics/repos/batcher', () => ({}))
vi.mock('@/server/domains/analytics/repos/pv-batcher', () => ({}))
vi.mock('@/server/domains/audit/repos/batcher', () => ({}))

vi.mock('@/server/domains/audit/services/scheduler', () => ({
  scheduleNextArchive: (...args: unknown[]) => scheduleNextArchive(...args),
  wireArchiveScheduler: vi.fn(),
}))

vi.mock('@/server/domains/backup/restore-orchestrator', () => ({
  registerRestoreComplete: (cb: (success: boolean, err?: Error) => Promise<void>) => registerRestoreComplete(cb),
}))

vi.mock('@/server/domains/comments/services/likes', () => ({
  resetLikeTokenSweep: (...args: unknown[]) => resetLikeTokenSweep(...args),
  startLikeTokenSweep: (...args: unknown[]) => startLikeTokenSweep(...args),
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  refreshBlogSettings: (...args: unknown[]) => refreshBlogSettings(...args),
}))

const { recreatePool, getDb, getPool } = await import('@/server/bootstrap/db-lifecycle')

describe('db-lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createDbPoolResult = { db: dbMock, pool: poolMock }
  })

  it('exposes the current db and pool', () => {
    expect(getDb()).toBe(dbMock)
    expect(getPool()).toBe(poolMock)
  })

  it('recreates the pool and reinitializes batchers', async () => {
    const instance = await recreatePool()
    expect(flushAllBatchers).toHaveBeenCalled()
    expect(instance.db).toBe(dbMock)
    expect(instance.pool).toBe(poolMock)
    expect(resetAllBatchers).toHaveBeenCalled()
    expect(initAllBatchers).toHaveBeenCalledWith(poolMock, dbMock)
    expect(resetLikeTokenSweep).toHaveBeenCalled()
    expect(startLikeTokenSweep).toHaveBeenCalledWith(dbMock)

    const wiringOrder = [
      flushAllBatchers,
      resetAllBatchers,
      resetLikeTokenSweep,
      setRestartDb,
      setRestartRefreshSettings,
      initAllBatchers,
      startLikeTokenSweep,
    ].map((mock) => mock.mock.invocationCallOrder[0])
    expect(wiringOrder).toEqual([...wiringOrder].sort((a, b) => a - b))
  })

  it('handles successful restore completion', async () => {
    expect(restoreCallback).not.toBeNull()
    await restoreCallback!(true)
    expect(migrateDatabase).toHaveBeenCalled()
    expect(restartServer).toHaveBeenCalled()
  })

  it('handles failed restore completion and pool recreation errors', async () => {
    createDbPoolResult = null as never

    await restoreCallback!(false, new Error('backup failed'))
    expect(restartServer).toHaveBeenCalled()
  })
})
