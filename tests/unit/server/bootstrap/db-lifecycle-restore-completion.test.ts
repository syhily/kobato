import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMigrateDatabase = vi.hoisted(() => vi.fn())
const mockRestartServer = vi.hoisted(() => vi.fn())
const mockOpenDatabase = vi.hoisted(() =>
  vi.fn(() => ({ db: {}, client: {}, path: ':memory:', inMemory: true, closed: false })),
)
const mockCloseDatabase = vi.hoisted(() => vi.fn())
const mockRegisterShutdownHook = vi.hoisted(() => vi.fn())
const mockSetRestartDb = vi.hoisted(() => vi.fn())
const mockSetRestartRefreshSettings = vi.hoisted(() => vi.fn())
const mockInitAllBatchers = vi.hoisted(() => vi.fn())
const mockFlushAllBatchers = vi.hoisted(() => vi.fn())
const mockResetAllBatchers = vi.hoisted(() => vi.fn())
const mockScheduleNextArchive = vi.hoisted(() => vi.fn())
const mockStartLikeTokenSweep = vi.hoisted(() => vi.fn())
const mockResetLikeTokenSweep = vi.hoisted(() => vi.fn())
const mockRefreshBlogSettings = vi.hoisted(() => vi.fn())
const mockRollbackPreRestoreFiles = vi.hoisted(() => vi.fn())
const mockCleanupPreRestoreFiles = vi.hoisted(() => vi.fn())

const restoreState = vi.hoisted(() => ({
  callback: null as ((success: boolean, err?: Error) => Promise<void>) | null,
}))

const mockWireRestoreMachine = vi.hoisted(() =>
  vi.fn((deps: { complete: (success: boolean, err?: Error) => Promise<void> }) => {
    restoreState.callback = deps.complete
  }),
)

vi.mock('@/server/infra/db/migrate', () => ({
  migrateDatabase: mockMigrateDatabase,
}))

vi.mock('@/server/infra/db/database', () => ({
  openDatabase: mockOpenDatabase,
  closeDatabase: mockCloseDatabase,
  resolveDatabasePath: () => ':memory:',
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: mockRegisterShutdownHook,
  restartServer: mockRestartServer,
  setRestartDb: mockSetRestartDb,
  setRestartRefreshSettings: mockSetRestartRefreshSettings,
}))

vi.mock('@/server/domains/backup/restore-machine', () => ({
  wireRestoreMachine: mockWireRestoreMachine,
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  refreshBlogSettings: mockRefreshBlogSettings,
}))

vi.mock('@/server/infra/db/batcher-registry', () => ({
  initAllBatchers: mockInitAllBatchers,
  flushAllBatchers: mockFlushAllBatchers,
  resetAllBatchers: mockResetAllBatchers,
}))

// db-lifecycle imports the batcher modules only for their registration
// side effect; the mocked registry absorbs the lifecycle calls.
// `wireAccessLogBatcher` is called by the real analytics-lifecycle at
// module scope (the composition root injecting the writer getter).
vi.mock('@/server/domains/analytics/services/batcher', () => ({
  wireAccessLogBatcher: vi.fn(),
}))
vi.mock('@/server/domains/analytics/services/pv-batcher', () => ({}))
vi.mock('@/server/domains/audit/services/batcher', () => ({}))

vi.mock('@/server/domains/audit/services/scheduler', () => ({
  scheduleNextArchive: mockScheduleNextArchive,
  rescheduleArchive: vi.fn(),
  wireArchiveScheduler: vi.fn(),
}))

vi.mock('@/server/domains/backup/scheduler', () => ({
  rescheduleBackup: vi.fn(),
  wireBackupScheduler: vi.fn(),
}))

vi.mock('@/server/domains/backup/services/restore', () => ({
  rollbackPreRestoreFiles: mockRollbackPreRestoreFiles,
  cleanupPreRestoreFiles: mockCleanupPreRestoreFiles,
}))

vi.mock('@/server/infra/email/sender', () => ({
  invalidateMailTransportCache: vi.fn(),
}))

vi.mock('@/server/domains/settings/services/section-changes', () => ({
  registerSectionChangeHandler: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/likes', () => ({
  startLikeTokenSweep: mockStartLikeTokenSweep,
  resetLikeTokenSweep: mockResetLikeTokenSweep,
}))

vi.mock('@/server/infra/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/infra/config')>()),
  isVitest: vi.fn(() => true),
}))

// Import the module to trigger module-level side effects (wireRestoreMachine).
import { completeRestore } from '@/server/bootstrap/db-lifecycle'

describe('db-lifecycle restore completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('wires the machine with completeRestore', () => {
    expect(restoreState.callback).toBe(completeRestore)
  })

  it('runs migrations after successful restore', async () => {
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await completeRestore(true, undefined)

    expect(mockMigrateDatabase).toHaveBeenCalledTimes(1)
    expect(mockRestartServer).toHaveBeenCalledTimes(1)
  })

  it('runs migrations even when restore failed', async () => {
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await completeRestore(false, new Error('restore failed'))

    expect(mockMigrateDatabase).toHaveBeenCalledTimes(1)
    expect(mockRestartServer).toHaveBeenCalledTimes(1)
  })

  it('logs error but still restarts server when migrations fail', async () => {
    mockMigrateDatabase.mockRejectedValue(new Error('migration failed'))
    mockRestartServer.mockResolvedValue(undefined)

    await completeRestore(true, undefined)

    expect(mockMigrateDatabase).toHaveBeenCalledTimes(1)
    expect(mockRestartServer).toHaveBeenCalledTimes(1)
  })

  it('rolls back the pre-restore originals before restarting on failure', async () => {
    mockRollbackPreRestoreFiles.mockResolvedValue(undefined)
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await completeRestore(false, new Error('restore failed'))

    expect(mockRollbackPreRestoreFiles).toHaveBeenCalledTimes(1)
    // The rollback must land before the server comes back — restarting
    // into the corrupt swapped payload is the wedge this guards against.
    expect(mockRollbackPreRestoreFiles.mock.invocationCallOrder[0]!).toBeLessThan(
      mockRestartServer.mock.invocationCallOrder[0]!,
    )
    expect(mockCleanupPreRestoreFiles).not.toHaveBeenCalled()
  })

  it('cleans the pre-restore originals after a successful restore and never rolls back', async () => {
    mockCleanupPreRestoreFiles.mockResolvedValue(undefined)
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await completeRestore(true, undefined)

    expect(mockRestartServer).toHaveBeenCalledTimes(1)
    expect(mockCleanupPreRestoreFiles).toHaveBeenCalledTimes(1)
    expect(mockRollbackPreRestoreFiles).not.toHaveBeenCalled()
  })
})
