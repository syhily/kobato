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

vi.mock('@kobato/server/infra/db/database', () => ({
  openDatabase: vi.fn(() => ({ db: dbMock, client: clientMock, path: ':memory:', inMemory: true, closed: false })),
  closeDatabase: (handle: { closed: boolean }) => {
    closeDatabase(handle)
    handle.closed = true
  },
  resolveDatabasePath: () => ':memory:',
}))

vi.mock('@kobato/server/infra/db/migrate', () => ({
  migrateDatabase: (...args: unknown[]) => migrateDatabase(...args),
}))

vi.mock('@kobato/server/infra/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kobato/server/infra/config')>()),
  isVitest: () => true,
}))

vi.mock('@kobato/server/infra/lifecycle', () => ({
  registerShutdownHook: (fn: () => unknown) => registerShutdownHook(fn),
  restartServer: (...args: unknown[]) => restartServer(...args),
  setRestartDb: (...args: unknown[]) => setRestartDb(...args),
  setRestartRefreshSettings: (...args: unknown[]) => setRestartRefreshSettings(...args),
}))

vi.mock('@kobato/server/infra/db/batcher-registry', () => ({
  initAllBatchers: (...args: unknown[]) => initAllBatchers(...args),
  flushAllBatchers: (...args: unknown[]) => flushAllBatchers(...args),
  resetAllBatchers: (...args: unknown[]) => resetAllBatchers(...args),
}))

// db-lifecycle imports the batcher modules only for their registration
// side effect; the mocked registry absorbs the lifecycle calls.
vi.mock('@kobato/server/domains/analytics/services/batcher', () => ({}))
vi.mock('@kobato/server/domains/analytics/services/pv-batcher', () => ({}))
vi.mock('@kobato/server/domains/audit/services/batcher', () => ({}))

vi.mock('@kobato/server/domains/audit/services/scheduler', () => ({
  scheduleNextArchive: (...args: unknown[]) => scheduleNextArchive(...args),
  rescheduleArchive: vi.fn(),
  wireArchiveScheduler: vi.fn(),
}))

vi.mock('@kobato/server/domains/backup/scheduler', () => ({
  rescheduleBackup: vi.fn(),
  wireBackupScheduler: vi.fn(),
}))

vi.mock('@kobato/server/infra/email/sender', () => ({
  invalidateMailTransportCache: vi.fn(),
}))

vi.mock('@kobato/server/domains/settings/services/section-changes', () => ({
  registerSectionChangeHandler: vi.fn(),
}))

vi.mock('@kobato/server/domains/backup/restore-machine', () => ({
  wireRestoreMachine: (deps: { complete: (success: boolean, err?: Error) => Promise<void> }) =>
    wireRestoreMachine(deps),
}))

vi.mock('@kobato/server/bootstrap/analytics-lifecycle', () => ({
  initAnalyticsDatabase: vi.fn(),
  closeAnalyticsForRestore: vi.fn(),
  snapshotAnalyticsTo: vi.fn(),
}))

vi.mock('@kobato/server/domains/comments/services/likes', () => ({
  resetLikeTokenSweep: (...args: unknown[]) => resetLikeTokenSweep(...args),
  startLikeTokenSweep: (...args: unknown[]) => startLikeTokenSweep(...args),
}))

vi.mock('@kobato/server/domains/settings/services/hydrate', () => ({
  refreshBlogSettings: (...args: unknown[]) => refreshBlogSettings(...args),
}))

const { reopenDatabase, prepareDatabaseForRestore, getDb, getDatabaseHandle } =
  await import('@kobato/server/bootstrap/db-lifecycle')

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
    const handle = getDatabaseHandle()
    await prepareDatabaseForRestore()

    expect(flushAllBatchers).toHaveBeenCalled()
    expect(resetAllBatchers).toHaveBeenCalled()
    expect(resetLikeTokenSweep).toHaveBeenCalled()
    expect(closeDatabase).toHaveBeenCalled()
    expect(handle.closed).toBe(true)

    const order = [flushAllBatchers, resetAllBatchers, resetLikeTokenSweep, closeDatabase].map(
      (mock) => mock.mock.invocationCallOrder[0],
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('reopens a closed handle, reinitializes batchers, and stays idempotent', async () => {
    // The previous case left the engine closed (module state persists
    // across cases in a file) — bring it back before exercising the
    // close/reopen cycle, and discount its wiring from the counts.
    await reopenDatabase()
    initAllBatchers.mockClear()
    const handle = getDatabaseHandle()
    await prepareDatabaseForRestore()
    expect(handle.closed).toBe(true)

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
