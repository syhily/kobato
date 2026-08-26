import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMigrateDatabase = vi.hoisted(() => vi.fn())
const mockRestartServer = vi.hoisted(() => vi.fn())
const mockScheduleRegisteredJob = vi.hoisted(() => vi.fn())
const mockRollbackPreRestoreFiles = vi.hoisted(() => vi.fn())
const mockCleanupPreRestoreFiles = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/db/migrate', () => ({
  migrateDatabase: mockMigrateDatabase,
}))

vi.mock('@/server/infra/lifecycle', () => ({
  restartServer: mockRestartServer,
}))

vi.mock('@/server/infra/job-registry', () => ({
  scheduleRegisteredJob: mockScheduleRegisteredJob,
}))

vi.mock('@/server/domains/backup/services/restore', () => ({
  rollbackPreRestoreFiles: mockRollbackPreRestoreFiles,
  cleanupPreRestoreFiles: mockCleanupPreRestoreFiles,
}))

import type { RestoreCompletionDeps } from '@/server/domains/backup/restore-completion'

import { createRestoreCompletion } from '@/server/domains/backup/restore-completion'

function makeDeps(): RestoreCompletionDeps & {
  reopenDatabase: ReturnType<typeof vi.fn>
  getDb: ReturnType<typeof vi.fn>
  getDatabaseHandle: ReturnType<typeof vi.fn>
  clientExec: ReturnType<typeof vi.fn>
} {
  const clientExec = vi.fn()
  return {
    reopenDatabase: vi.fn().mockResolvedValue({ db: {}, client: { exec: clientExec } }),
    getDb: vi.fn().mockReturnValue({ id: 'db' }),
    getDatabaseHandle: vi.fn().mockReturnValue({ client: { exec: clientExec } }),
    clientExec,
  }
}

describe('backup/restore-completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs migrations, ANALYZE, and the restart after a successful restore', async () => {
    const deps = makeDeps()
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await createRestoreCompletion(deps)(true, undefined)

    expect(mockMigrateDatabase).toHaveBeenCalledTimes(1)
    expect(deps.clientExec).toHaveBeenCalledWith('ANALYZE')
    expect(mockRestartServer).toHaveBeenCalledTimes(1)
  })

  it('rolls back the pre-restore originals before restarting on failure', async () => {
    const deps = makeDeps()
    mockRollbackPreRestoreFiles.mockResolvedValue(undefined)
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await createRestoreCompletion(deps)(false, new Error('restore failed'))

    expect(mockRollbackPreRestoreFiles).toHaveBeenCalledTimes(1)
    // The rollback must land before the server comes back — restarting
    // into the corrupt swapped payload is the wedge this guards against.
    expect(mockRollbackPreRestoreFiles.mock.invocationCallOrder[0]!).toBeLessThan(
      mockRestartServer.mock.invocationCallOrder[0]!,
    )
    // The failure path never deletes the originals.
    expect(mockCleanupPreRestoreFiles).not.toHaveBeenCalled()
  })

  it('cleans the pre-restore originals after a successful restore and never rolls back', async () => {
    const deps = makeDeps()
    mockCleanupPreRestoreFiles.mockResolvedValue(undefined)
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await createRestoreCompletion(deps)(true, undefined)

    expect(mockRestartServer).toHaveBeenCalledTimes(1)
    expect(mockCleanupPreRestoreFiles).toHaveBeenCalledTimes(1)
    expect(mockRollbackPreRestoreFiles).not.toHaveBeenCalled()
  })

  it('logs error but still restarts server when migrations fail', async () => {
    const deps = makeDeps()
    mockMigrateDatabase.mockRejectedValue(new Error('migration failed'))
    mockRestartServer.mockResolvedValue(undefined)

    await createRestoreCompletion(deps)(true, undefined)

    expect(mockRestartServer).toHaveBeenCalledTimes(1)
  })

  it('reschedules the archive job only once the database is live again', async () => {
    const deps = makeDeps()
    mockMigrateDatabase.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)

    await createRestoreCompletion(deps)(true, undefined)

    expect(mockScheduleRegisteredJob).toHaveBeenCalledWith('audit.scheduler')
  })

  it('never restarts into a dead handle when the reopen fails', async () => {
    const deps = makeDeps()
    deps.reopenDatabase.mockRejectedValue(new Error('reopen failed'))

    await createRestoreCompletion(deps)(true, undefined)

    expect(mockScheduleRegisteredJob).not.toHaveBeenCalled()
    expect(mockMigrateDatabase).not.toHaveBeenCalled()
    expect(mockRestartServer).not.toHaveBeenCalled()
    expect(mockCleanupPreRestoreFiles).not.toHaveBeenCalled()
  })
})
