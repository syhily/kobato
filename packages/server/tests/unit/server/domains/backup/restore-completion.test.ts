import type { RestoreCompletionDeps } from '@kobato/server/domains/backup/restore-completion.ts'

import { __setEnginePathsForTests } from '@kobato/server/infra/db/paths.ts'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycleModule = await import('@kobato/server/infra/lifecycle.ts')
const jobRegistryModule = await import('@kobato/server/infra/job-registry.ts')
const restoreModule = await import('@kobato/server/domains/backup/services/restore.ts')

// The restart boundary rebinds the whole process; it is observed, not run.
const restartServer = vi.spyOn(lifecycleModule, 'restartServer').mockResolvedValue(undefined as never)
// The audit scheduler only registers when its module loads; the real lookup
// is a no-op here and the call is what pins the ordering.
const scheduleRegisteredJob = vi.spyOn(jobRegistryModule, 'scheduleRegisteredJob')
// Rollback/cleanup run for real against the pinned engine paths.
const rollbackPreRestoreFiles = vi.spyOn(restoreModule, 'rollbackPreRestoreFiles')
const cleanupPreRestoreFiles = vi.spyOn(restoreModule, 'cleanupPreRestoreFiles')

const { createRestoreCompletion } = await import('@kobato/server/domains/backup/restore-completion.ts')

let enginePaths: { database: string; analytics: string }

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-restore-completion-'))
  enginePaths = { database: join(dir, 'kobato.db'), analytics: join(dir, 'analytics.duckdb') }
  __setEnginePathsForTests(enginePaths)
  writeFileSync(enginePaths.database, 'restored-db')
  writeFileSync(`${enginePaths.database}.pre-restore`, 'live-db')
  writeFileSync(enginePaths.analytics, 'restored-analytics')
  writeFileSync(`${enginePaths.analytics}.pre-restore`, 'live-analytics')
})

afterEach(() => {
  __setEnginePathsForTests(null)
  rmSync(join(enginePaths.database, '..'), { recursive: true, force: true })
  restartServer.mockClear()
  scheduleRegisteredJob.mockClear()
  rollbackPreRestoreFiles.mockClear()
  cleanupPreRestoreFiles.mockClear()
})

afterAll(() => {
  restartServer.mockRestore()
  scheduleRegisteredJob.mockRestore()
  rollbackPreRestoreFiles.mockRestore()
  cleanupPreRestoreFiles.mockRestore()
})

function makeDeps(): RestoreCompletionDeps & {
  reopenDatabase: ReturnType<typeof vi.fn>
  getDb: ReturnType<typeof vi.fn>
  dbRun: ReturnType<typeof vi.fn>
  wipeCache: ReturnType<typeof vi.fn>
  notifyCacheWipeFailed: ReturnType<typeof vi.fn>
  migrateDatabase: ReturnType<typeof vi.fn>
} {
  const dbRun = vi.fn()
  return {
    reopenDatabase: vi.fn().mockResolvedValue({ db: {}, client: { exec: vi.fn() } }),
    getDb: vi.fn().mockReturnValue({ run: dbRun }),
    migrateDatabase: vi.fn().mockResolvedValue(undefined),
    wipeCache: vi.fn().mockResolvedValue(undefined),
    notifyCacheWipeFailed: vi.fn<() => void>(),
    dbRun,
  }
}

describe('backup/restore-completion', () => {
  it('runs migrations, ANALYZE, and the restart after a successful restore', async () => {
    const deps = makeDeps()

    await createRestoreCompletion(deps)(true, undefined)

    expect(deps.migrateDatabase).toHaveBeenCalledTimes(1)
    expect(deps.dbRun).toHaveBeenCalledTimes(1)
    expect(restartServer).toHaveBeenCalledTimes(1)
    expect(deps.wipeCache).toHaveBeenCalledTimes(1)
    expect(deps.notifyCacheWipeFailed).not.toHaveBeenCalled()
  })

  it('wipes the cache after reopen/migrate and before restart', async () => {
    const deps = makeDeps()

    await createRestoreCompletion(deps)(true, undefined)

    const reopenAt = deps.reopenDatabase.mock.invocationCallOrder[0]!
    const migrateAt = deps.migrateDatabase.mock.invocationCallOrder[0]!
    const wipeAt = deps.wipeCache.mock.invocationCallOrder[0]!
    const restartAt = restartServer.mock.invocationCallOrder[0]!
    expect(reopenAt).toBeLessThan(migrateAt)
    expect(migrateAt).toBeLessThan(wipeAt)
    expect(wipeAt).toBeLessThan(restartAt)
  })

  it('notifies admins and still restarts when the cache wipe fails', async () => {
    const deps = makeDeps()
    deps.wipeCache.mockRejectedValue(new AggregateError([new Error('bucket busy')], 'cache wipe failed'))

    await createRestoreCompletion(deps)(true, undefined)

    expect(deps.wipeCache).toHaveBeenCalledTimes(1)
    expect(deps.notifyCacheWipeFailed).toHaveBeenCalledTimes(1)
    expect(restartServer).toHaveBeenCalledTimes(1)
  })

  it('still restarts when the cache-wipe notification itself throws', async () => {
    const deps = makeDeps()
    deps.wipeCache.mockRejectedValue(new Error('cache wipe failed'))
    deps.notifyCacheWipeFailed.mockImplementation(() => {
      throw new Error('notifications unavailable')
    })

    await expect(createRestoreCompletion(deps)(true, undefined)).resolves.toBeUndefined()
    expect(deps.notifyCacheWipeFailed).toHaveBeenCalledTimes(1)
    expect(restartServer).toHaveBeenCalledTimes(1)
  })

  it('rolls the pre-restore originals back before restarting on failure', async () => {
    const deps = makeDeps()

    await createRestoreCompletion(deps)(false, new Error('restore failed'))

    expect(rollbackPreRestoreFiles).toHaveBeenCalledTimes(1)
    expect(rollbackPreRestoreFiles.mock.invocationCallOrder[0]!).toBeLessThan(
      restartServer.mock.invocationCallOrder[0]!,
    )
    expect(cleanupPreRestoreFiles).not.toHaveBeenCalled()
    expect(deps.wipeCache).not.toHaveBeenCalled()
    expect(deps.notifyCacheWipeFailed).not.toHaveBeenCalled()
    expect(readFileSync(enginePaths.database, 'utf8')).toBe('live-db')
    expect(readFileSync(enginePaths.analytics, 'utf8')).toBe('live-analytics')
    expect(existsSync(`${enginePaths.database}.pre-restore`)).toBe(false)
  })

  it('cleans the pre-restore originals after a successful restore and never rolls back', async () => {
    const deps = makeDeps()

    await createRestoreCompletion(deps)(true, undefined)

    expect(restartServer).toHaveBeenCalledTimes(1)
    expect(cleanupPreRestoreFiles).toHaveBeenCalledTimes(1)
    expect(rollbackPreRestoreFiles).not.toHaveBeenCalled()
    expect(readFileSync(enginePaths.database, 'utf8')).toBe('restored-db')
    expect(existsSync(`${enginePaths.database}.pre-restore`)).toBe(false)
    expect(existsSync(`${enginePaths.analytics}.pre-restore`)).toBe(false)
  })

  it('logs error but still restarts server when migrations fail', async () => {
    const deps = makeDeps()
    deps.migrateDatabase.mockRejectedValue(new Error('migration failed'))

    await createRestoreCompletion(deps)(true, undefined)

    expect(restartServer).toHaveBeenCalledTimes(1)
    expect(deps.wipeCache).toHaveBeenCalledTimes(1)
  })

  it('reschedules the archive job only once the database is live again', async () => {
    const deps = makeDeps()

    await createRestoreCompletion(deps)(true, undefined)

    expect(scheduleRegisteredJob).toHaveBeenCalledWith('audit.scheduler')
  })

  it('never restarts into a dead handle when the reopen fails', async () => {
    const deps = makeDeps()
    deps.reopenDatabase.mockRejectedValue(new Error('reopen failed'))

    await createRestoreCompletion(deps)(true, undefined)

    expect(scheduleRegisteredJob).not.toHaveBeenCalled()
    expect(deps.migrateDatabase).not.toHaveBeenCalled()
    expect(restartServer).not.toHaveBeenCalled()
    expect(cleanupPreRestoreFiles).not.toHaveBeenCalled()
    expect(deps.wipeCache).not.toHaveBeenCalled()
    expect(deps.notifyCacheWipeFailed).not.toHaveBeenCalled()
  })
})
