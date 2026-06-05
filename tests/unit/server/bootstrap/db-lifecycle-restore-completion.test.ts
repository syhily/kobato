import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMigrateDatabase = vi.hoisted(() => vi.fn())
const mockRestartServer = vi.hoisted(() => vi.fn())
const mockCreateDbPool = vi.hoisted(() => vi.fn(() => ({ db: {}, pool: {} })))
const mockClosePool = vi.hoisted(() => vi.fn())
const mockRegisterShutdownHook = vi.hoisted(() => vi.fn())
const mockSetRestartDb = vi.hoisted(() => vi.fn())
const mockSetRestartRefreshSettings = vi.hoisted(() => vi.fn())
const mockInitAccessLogBatcher = vi.hoisted(() => vi.fn())
const mockResetAccessLogBatcher = vi.hoisted(() => vi.fn())
const mockFlushAccessLog = vi.hoisted(() => vi.fn())
const mockInitPageViewBatcher = vi.hoisted(() => vi.fn())
const mockResetPageViewBatcher = vi.hoisted(() => vi.fn())
const mockFlushPageViews = vi.hoisted(() => vi.fn())
const mockInitAuditLogBatcher = vi.hoisted(() => vi.fn())
const mockResetAuditLogBatcher = vi.hoisted(() => vi.fn())
const mockFlushAuditLog = vi.hoisted(() => vi.fn())
const mockScheduleNextArchive = vi.hoisted(() => vi.fn())
const mockStartLikeTokenSweep = vi.hoisted(() => vi.fn())
const mockResetLikeTokenSweep = vi.hoisted(() => vi.fn())
const mockRefreshBlogSettings = vi.hoisted(() => vi.fn())

const restoreState = vi.hoisted(() => ({
  callback: null as ((success: boolean, err?: Error) => Promise<void>) | null,
}))

const mockRegisterRestoreComplete = vi.hoisted(() =>
  vi.fn((fn: (success: boolean, err?: Error) => Promise<void>) => {
    restoreState.callback = fn
  }),
)

const mockResetRestoreComplete = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/db/migrate', () => ({
  migrateDatabase: mockMigrateDatabase,
}))

vi.mock('@/server/infra/db/pool', () => ({
  createDbPool: mockCreateDbPool,
  closePool: mockClosePool,
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: mockRegisterShutdownHook,
  restartServer: mockRestartServer,
  setRestartDb: mockSetRestartDb,
  setRestartRefreshSettings: mockSetRestartRefreshSettings,
}))

vi.mock('@/server/domains/backup/restore-orchestrator', () => ({
  registerRestoreComplete: mockRegisterRestoreComplete,
  resetRestoreComplete: mockResetRestoreComplete,
}))

vi.mock('@/server/domains/settings/snapshot', () => ({
  refreshBlogSettings: mockRefreshBlogSettings,
}))

vi.mock('@/server/domains/analytics/repos/batcher', () => ({
  initAccessLogBatcher: mockInitAccessLogBatcher,
  resetAccessLogBatcher: mockResetAccessLogBatcher,
  flushAccessLog: mockFlushAccessLog,
}))

vi.mock('@/server/domains/analytics/repos/pv-batcher', () => ({
  initPageViewBatcher: mockInitPageViewBatcher,
  resetPageViewBatcher: mockResetPageViewBatcher,
  flushPageViews: mockFlushPageViews,
}))

vi.mock('@/server/domains/audit/repos/batcher', () => ({
  initAuditLogBatcher: mockInitAuditLogBatcher,
  resetAuditLogBatcher: mockResetAuditLogBatcher,
  flushAuditLog: mockFlushAuditLog,
}))

vi.mock('@/server/domains/audit/services/scheduler', () => ({
  scheduleNextArchive: mockScheduleNextArchive,
}))

vi.mock('@/server/domains/comments/services/likes', () => ({
  startLikeTokenSweep: mockStartLikeTokenSweep,
  resetLikeTokenSweep: mockResetLikeTokenSweep,
}))

vi.mock('@/server/infra/env', () => ({
  isVitest: vi.fn(() => true),
}))

vi.mock('@/server/infra/logger', () => ({
  root: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}))

// Import the module to trigger module-level side effects (registerRestoreComplete).
import '@/server/bootstrap/db-lifecycle'

describe('db-lifecycle restore completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers a restore completion callback', () => {
    expect(restoreState.callback).not.toBeNull()
  })

  it('runs migrations after successful restore', async () => {
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await restoreState.callback!(true, undefined)

    expect(mockMigrateDatabase).toHaveBeenCalledTimes(1)
    expect(mockRestartServer).toHaveBeenCalledTimes(1)
  })

  it('runs migrations even when restore failed', async () => {
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await restoreState.callback!(false, new Error('restore failed'))

    expect(mockMigrateDatabase).toHaveBeenCalledTimes(1)
    expect(mockRestartServer).toHaveBeenCalledTimes(1)
  })

  it('logs error but still restarts server when migrations fail', async () => {
    mockMigrateDatabase.mockRejectedValue(new Error('migration failed'))
    mockRestartServer.mockResolvedValue(undefined)

    await restoreState.callback!(true, undefined)

    expect(mockMigrateDatabase).toHaveBeenCalledTimes(1)
    expect(mockRestartServer).toHaveBeenCalledTimes(1)
  })
})
