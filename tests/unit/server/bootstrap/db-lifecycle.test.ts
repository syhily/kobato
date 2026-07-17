import { beforeEach, describe, expect, it, vi } from 'vitest'

const poolMock = { id: 'pool' }
const dbMock = { id: 'db' }
let createDbPoolResult = { db: dbMock, pool: poolMock }

let restoreCallback: ((success: boolean, err?: Error) => Promise<void>) | null = null

const flushAuditLog = vi.fn()
const flushAccessLog = vi.fn()
const flushPageViews = vi.fn()
const initAccessLogBatcher = vi.fn()
const initPageViewBatcher = vi.fn()
const initAuditLogBatcher = vi.fn()
const resetAccessLogBatcher = vi.fn()
const resetPageViewBatcher = vi.fn()
const resetAuditLogBatcher = vi.fn()
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
}))

vi.mock('@/server/domains/analytics/repos/batcher', () => ({
  flushAccessLog: (...args: unknown[]) => flushAccessLog(...args),
  initAccessLogBatcher: (...args: unknown[]) => initAccessLogBatcher(...args),
  resetAccessLogBatcher: (...args: unknown[]) => resetAccessLogBatcher(...args),
}))

vi.mock('@/server/domains/analytics/repos/pv-batcher', () => ({
  flushPageViews: (...args: unknown[]) => flushPageViews(...args),
  initPageViewBatcher: (...args: unknown[]) => initPageViewBatcher(...args),
  resetPageViewBatcher: (...args: unknown[]) => resetPageViewBatcher(...args),
}))

vi.mock('@/server/domains/audit/repos/batcher', () => ({
  flushAuditLog: (...args: unknown[]) => flushAuditLog(...args),
  initAuditLogBatcher: (...args: unknown[]) => initAuditLogBatcher(...args),
  resetAuditLogBatcher: (...args: unknown[]) => resetAuditLogBatcher(...args),
}))

vi.mock('@/server/domains/audit/services/scheduler', () => ({
  scheduleNextArchive: (...args: unknown[]) => scheduleNextArchive(...args),
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
    expect(flushAuditLog).toHaveBeenCalled()
    expect(flushAccessLog).toHaveBeenCalled()
    expect(flushPageViews).toHaveBeenCalled()
    expect(instance.db).toBe(dbMock)
    expect(instance.pool).toBe(poolMock)
    expect(resetAccessLogBatcher).toHaveBeenCalled()
    expect(resetPageViewBatcher).toHaveBeenCalled()
    expect(resetAuditLogBatcher).toHaveBeenCalled()
    expect(initAccessLogBatcher).toHaveBeenCalledWith(poolMock)
    expect(initPageViewBatcher).toHaveBeenCalledWith(dbMock)
    expect(initAuditLogBatcher).toHaveBeenCalledWith(dbMock, poolMock)
    expect(resetLikeTokenSweep).toHaveBeenCalled()
    expect(startLikeTokenSweep).toHaveBeenCalledWith(dbMock)

    const wiringOrder = [
      resetAccessLogBatcher,
      resetPageViewBatcher,
      resetAuditLogBatcher,
      resetLikeTokenSweep,
      setRestartDb,
      setRestartRefreshSettings,
      initAccessLogBatcher,
      initPageViewBatcher,
      initAuditLogBatcher,
      startLikeTokenSweep,
    ].map((mock) => mock.mock.invocationCallOrder[0])
    expect(wiringOrder).toEqual([...wiringOrder].sort((a, b) => a - b))
  })

  it('warns but continues when flush helpers fail during recreatePool', async () => {
    flushAuditLog.mockRejectedValueOnce(new Error('audit flush failed'))
    flushAccessLog.mockRejectedValueOnce(new Error('access flush failed'))
    flushPageViews.mockRejectedValueOnce(new Error('pv flush failed'))

    await recreatePool()

    expect(flushAuditLog).toHaveBeenCalled()
    expect(flushAccessLog).toHaveBeenCalled()
    expect(flushPageViews).toHaveBeenCalled()
  })

  it('handles successful restore completion', async () => {
    expect(restoreCallback).not.toBeNull()
    await restoreCallback!(true)
    expect(migrateDatabase).toHaveBeenCalled()
    expect(restartServer).toHaveBeenCalled()
  })

  it('handles failed restore completion and pool recreation errors', async () => {
    createDbPoolResult = null as never
    const err = new Error('recreate failed')
    flushAuditLog.mockRejectedValueOnce(err)
    flushAccessLog.mockRejectedValueOnce(err)
    flushPageViews.mockRejectedValueOnce(err)

    await restoreCallback!(false, new Error('backup failed'))
    expect(restartServer).toHaveBeenCalled()
  })
})
