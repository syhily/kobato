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
const refreshBlogSettings = vi.fn()
const restartServer = vi.fn()
const setRestartGetDb = vi.fn()
const setRestartRefreshSettings = vi.fn()
const closeDatabase = vi.fn()
const registerShutdownHook = vi.fn((fn: () => unknown) => fn())
const wireRestoreMachine = vi.fn((deps: { complete: (success: boolean, err?: Error) => Promise<void> }) => {
  restoreCallback = deps.complete
})

vi.mock('@kobato/server/infra/db/database.ts', () => ({
  openDatabase: vi.fn(() => ({ db: dbMock, client: clientMock, path: ':memory:', inMemory: true, closed: false })),
  closeDatabase: (handle: { closed: boolean }) => {
    closeDatabase(handle)
    handle.closed = true
  },
  resolveDatabasePath: () => ':memory:',
}))

vi.mock('@kobato/server/infra/db/migrate.ts', () => ({
  migrateDatabase: (...args: unknown[]) => migrateDatabase(...args),
}))

vi.mock('@kobato/server/infra/config.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kobato/server/infra/config.ts')>()),
  isVitest: () => true,
}))

vi.mock('@kobato/server/infra/lifecycle.ts', () => ({
  registerShutdownHook: (fn: () => unknown) => registerShutdownHook(fn),
  restartServer: (...args: unknown[]) => restartServer(...args),
  setRestartGetDb: (...args: unknown[]) => setRestartGetDb(...args),
  setRestartRefreshSettings: (...args: unknown[]) => setRestartRefreshSettings(...args),
}))

vi.mock('@kobato/server/infra/db/batcher-registry.ts', () => ({
  initAllBatchers: (...args: unknown[]) => initAllBatchers(...args),
  flushAllBatchers: (...args: unknown[]) => flushAllBatchers(...args),
  resetAllBatchers: (...args: unknown[]) => resetAllBatchers(...args),
}))

// db-lifecycle imports the batcher modules only for their registration
// side effect; the mocked registry absorbs the lifecycle calls.
vi.mock('@kobato/server/domains/analytics/services/batcher.ts', () => ({}))
vi.mock('@kobato/server/domains/analytics/services/pv-batcher.ts', () => ({}))
vi.mock('@kobato/server/domains/audit/services/batcher.ts', () => ({}))

vi.mock('@kobato/server/domains/audit/services/scheduler.ts', () => ({
  rescheduleArchive: vi.fn(),
}))

vi.mock('@kobato/server/domains/backup/scheduler.ts', () => ({
  rescheduleBackup: vi.fn(),
}))

vi.mock('@kobato/server/infra/email/sender.ts', () => ({
  invalidateMailTransportCache: vi.fn(),
}))

vi.mock('@kobato/server/domains/settings/services/section-changes.ts', () => ({
  registerSectionChangeHandler: vi.fn(),
}))

vi.mock('@kobato/server/domains/backup/restore-machine.ts', () => ({
  wireRestoreMachine: (deps: { complete: (success: boolean, err?: Error) => Promise<void> }) =>
    wireRestoreMachine(deps),
}))

vi.mock('@kobato/server/bootstrap/analytics-lifecycle.ts', () => ({
  initAnalyticsDatabase: vi.fn(),
  closeAnalyticsForRestore: vi.fn(),
  snapshotAnalyticsTo: vi.fn(),
}))

vi.mock('@kobato/server/domains/comments/services/likes.ts', () => ({
  resetLikeTokenSweep: (...args: unknown[]) => resetLikeTokenSweep(...args),
  startLikeTokenSweep: (...args: unknown[]) => startLikeTokenSweep(...args),
}))

vi.mock('@kobato/server/domains/settings/services/hydrate.ts', () => ({
  refreshBlogSettings: (...args: unknown[]) => refreshBlogSettings(...args),
}))

const { reopenDatabase, prepareDatabaseForRestore, getDb, getDatabaseHandle } =
  await import('@kobato/server/bootstrap/db-lifecycle.ts')

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
    // The prior case left the engine closed (module state persists across cases) — reopen
    // before exercising the cycle, and discount that wiring from the counts.
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
