import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMock = { id: 'client' }
const dbMock = { id: 'db' }
let openDatabaseResult = { db: dbMock, client: clientMock, path: ':memory:', closed: false }

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
const closeDatabase = vi.fn()
const registerShutdownHook = vi.fn((fn: () => unknown) => fn())
const registerRestoreComplete = vi.fn((cb: (success: boolean, err?: Error) => Promise<void>) => {
  restoreCallback = cb
})

vi.mock('@/server/infra/db/database', () => ({
  openDatabase: vi.fn(() => openDatabaseResult),
  closeDatabase: (...args: unknown[]) => closeDatabase(...args),
  resolveDatabasePath: () => ':memory:',
}))

vi.mock('@/server/infra/db/migrate', () => ({
  migrateDatabase: (...args: unknown[]) => migrateDatabase(...args),
}))

vi.mock('@/server/infra/config', () => ({
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
vi.mock('@/server/domains/analytics/services/batcher', () => ({}))
vi.mock('@/server/domains/analytics/services/pv-batcher', () => ({}))
vi.mock('@/server/domains/audit/services/batcher', () => ({}))

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

const { reopenDatabase, getDb, getDatabaseHandle } = await import('@/server/bootstrap/db-lifecycle')

describe('db-lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openDatabaseResult = { db: dbMock, client: clientMock, path: ':memory:', closed: false }
  })

  it('exposes the current db and handle', () => {
    expect(getDb()).toBe(dbMock)
    expect(getDatabaseHandle().db).toBe(dbMock)
    expect(getDatabaseHandle().client).toBe(clientMock)
  })

  it('recreates the pool and reinitializes batchers', async () => {
    const instance = await reopenDatabase()
    expect(flushAllBatchers).toHaveBeenCalled()
    expect(instance.db).toBe(dbMock)
    expect(instance.client).toBe(clientMock)
    expect(resetAllBatchers).toHaveBeenCalled()
    expect(initAllBatchers).toHaveBeenCalledWith(openDatabaseResult)
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
    openDatabaseResult = null as never

    await restoreCallback!(false, new Error('backup failed'))
    expect(restartServer).toHaveBeenCalled()
  })
})
