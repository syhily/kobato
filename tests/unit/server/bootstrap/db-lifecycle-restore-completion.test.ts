import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMigrateDatabase = vi.hoisted(() => vi.fn())
const mockRestartServer = vi.hoisted(() => vi.fn())
const mockOpenDatabase = vi.hoisted(() => vi.fn(() => ({ db: {}, client: {}, path: ':memory:', closed: false })))
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
vi.mock('@/server/domains/analytics/services/batcher', () => ({}))
vi.mock('@/server/domains/analytics/services/pv-batcher', () => ({}))
vi.mock('@/server/domains/audit/services/batcher', () => ({}))

vi.mock('@/server/domains/audit/services/scheduler', () => ({
  scheduleNextArchive: mockScheduleNextArchive,
  wireArchiveScheduler: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/likes', () => ({
  startLikeTokenSweep: mockStartLikeTokenSweep,
  resetLikeTokenSweep: mockResetLikeTokenSweep,
}))

vi.mock('@/server/infra/config', () => ({
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

// Import the module to trigger module-level side effects (wireRestoreMachine).
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
