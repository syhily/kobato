import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMock = { id: 'client' }
const dbMock = { id: 'db' }

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
const wireRestoreMachine = vi.fn((deps: { complete: (success: boolean, err?: Error) => Promise<void> }) => {
  restoreCallback = deps.complete
})

vi.mock('@/server/infra/db/database', () => ({
  openDatabase: vi.fn(() => ({ db: dbMock, client: clientMock, path: ':memory:', inMemory: true, closed: false })),
  closeDatabase: (handle: { closed: boolean }) => {
    closeDatabase(handle)
    handle.closed = true
  },
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

vi.mock('@/server/domains/backup/restore-machine', () => ({
  wireRestoreMachine: (deps: { complete: (success: boolean, err?: Error) => Promise<void> }) =>
    wireRestoreMachine(deps),
}))

vi.mock('@/server/bootstrap/analytics-lifecycle', () => ({
  initAnalyticsDatabase: vi.fn(),
  closeAnalyticsForRestore: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/likes', () => ({
  resetLikeTokenSweep: (...args: unknown[]) => resetLikeTokenSweep(...args),
  startLikeTokenSweep: (...args: unknown[]) => startLikeTokenSweep(...args),
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  refreshBlogSettings: (...args: unknown[]) => refreshBlogSettings(...args),
}))

const { reopenDatabase, prepareDatabaseForRestore, getDb, getDatabaseHandle } =
  await import('@/server/bootstrap/db-lifecycle')

describe('db-lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes the current db and handle', () => {
    expect(getDb()).toBe(dbMock)
    expect(getDatabaseHandle().db).toBe(dbMock)
    expect(getDatabaseHandle().client).toBe(clientMock)
  })

  it('prepares the database for the file swap (flush + reset + close, in order)', async () => {
    await prepareDatabaseForRestore()

    expect(flushAllBatchers).toHaveBeenCalled()
    expect(resetAllBatchers).toHaveBeenCalled()
    expect(resetLikeTokenSweep).toHaveBeenCalled()
    expect(closeDatabase).toHaveBeenCalled()
    expect(getDatabaseHandle().closed).toBe(true)

    const order = [flushAllBatchers, resetAllBatchers, resetLikeTokenSweep, closeDatabase].map(
      (mock) => mock.mock.invocationCallOrder[0],
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('reopens a closed handle, reinitializes batchers, and stays idempotent', async () => {
    await prepareDatabaseForRestore()
    expect(getDatabaseHandle().closed).toBe(true)

    const instance = await reopenDatabase()
    expect(instance.db).toBe(dbMock)
    expect(instance.client).toBe(clientMock)
    expect(initAllBatchers).toHaveBeenCalled()
    expect(startLikeTokenSweep).toHaveBeenCalledWith(dbMock)

    // Second call on an open handle: no re-wiring, same instance.
    const again = await reopenDatabase()
    expect(again).toBe(instance)
    expect(initAllBatchers).toHaveBeenCalledTimes(1) // the reopen (boot wiring was cleared in beforeEach)
  })

  it('handles successful restore completion', async () => {
    expect(restoreCallback).not.toBeNull()
    await restoreCallback!(true)
    expect(migrateDatabase).toHaveBeenCalled()
    expect(restartServer).toHaveBeenCalled()
  })

  it('handles failed restore completion and pool recreation errors', async () => {
    await restoreCallback!(false, new Error('backup failed'))
    expect(restartServer).toHaveBeenCalled()
  })
})
