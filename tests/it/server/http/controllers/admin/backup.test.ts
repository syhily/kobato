import { call, ORPCError } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/backup/services/shared', () => ({
  checkPgToolsAvailable: vi.fn(),
}))

vi.mock('@/server/domains/backup/services/backup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/backup/services/backup')>()
  return {
    ...actual,
    createBackup: vi.fn(),
    deleteBackup: vi.fn(),
    getBackupBuffer: vi.fn(),
    listBackups: vi.fn(),
  }
})

vi.mock('@/server/domains/backup/services/restore', () => ({
  restoreFromBackup: vi.fn(),
}))

vi.mock('@/server/domains/backup/restore-orchestrator', () => ({
  performSafeRestore: vi.fn(),
  registerRestoreComplete: vi.fn(),
}))

vi.mock('@/server/infra/storage/registry', () => ({
  activeBackend: vi.fn(),
}))

vi.mock('@/server/infra/lifecycle', () => ({
  requestShutdown: vi.fn(),
  registerShutdownHook: vi.fn(),
  unregisterShutdownHook: vi.fn(),
  setServerPhase: vi.fn(),
  restartServer: vi.fn(),
  getRestoreState: vi.fn(() => ({ phase: 'idle' })),
  setRestartDb: vi.fn(),
  setRestartRefreshSettings: vi.fn(),
}))

const backupService = await import('@/server/domains/backup/services/backup')
const orchestrator = await import('@/server/domains/backup/restore-orchestrator')
const registry = await import('@/server/infra/storage/registry')
const { adminBackupRouter } = await import('@/server/http/controllers/admin/backup.controller')

describe('adminBackupRouter.status', () => {
  it('returns the active primary driver', async () => {
    vi.mocked(registry.activeBackend).mockReturnValue({ backend: {} as never, driver: 's3' })
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.status, undefined, { context: ctx })
    expect(res).toEqual({ primaryDriver: 's3' })
  })
})

describe('adminBackupRouter.list', () => {
  it('returns files array', async () => {
    const files = [
      {
        key: '2026-01-01T00-00-00',
        fileName: 'backup-2026-01-01T00-00-00.sql.gz',
        size: 1024,
        lastModified: '2026-01-01T00:00:00.000Z',
      },
    ]
    vi.mocked(backupService.listBackups).mockResolvedValueOnce({ files, nextContinuationToken: undefined })
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.list, undefined, { context: ctx })
    expect(res.files).toHaveLength(1)
    expect(res.files[0].fileName).toBe('backup-2026-01-01T00-00-00.sql.gz')
    expect(res.nextContinuationToken).toBeUndefined()
  })
})

describe('adminBackupRouter.create', () => {
  it('returns fileName and size on success', async () => {
    vi.mocked(backupService.createBackup).mockResolvedValueOnce({
      fileName: '2026-01-01.sql.gz',
      size: 2048,
      timestamp: '2026-01-01T00-00-00',
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.create, undefined, { context: ctx })
    expect(res).toEqual({ fileName: '2026-01-01.sql.gz', size: 2048, timestamp: '2026-01-01T00-00-00' })
  })
})

describe('adminBackupRouter.delete', () => {
  it('returns success after deleting backup', async () => {
    vi.mocked(backupService.deleteBackup).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.delete, { key: '2026-01-01T00-00-00' }, { context: ctx })
    expect(res).toEqual({ success: true })
  })

  it('rejects invalid key formats', async () => {
    const ctx = makeAuthedCtx()
    for (const badKey of ['../etc/passwd', 'backup/../../secret', 'backup/x.sql.gz', '', 'abc']) {
      await expect(call(adminBackupRouter.delete, { key: badKey }, { context: ctx })).rejects.toThrow(ORPCError)
    }
  })
})

describe('adminBackupRouter.restore', () => {
  it('returns accepted after restoring backup', async () => {
    const buffer = Buffer.from('sql')
    vi.mocked(backupService.getBackupBuffer).mockResolvedValueOnce(buffer)
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: ctx })
    expect(res).toEqual({ accepted: true })
    expect(orchestrator.performSafeRestore).toHaveBeenCalledWith(
      { prepareForSwap: expect.any(Function), reopenAfterSwap: expect.any(Function), log: expect.any(Object) },
      expect.any(Function),
      expect.any(Function),
    )
  })

  it('rejects invalid key formats', async () => {
    const ctx = makeAuthedCtx()
    for (const badKey of ['../etc/passwd', 'backup/../../secret', 'backup/x.sql.gz', '']) {
      await expect(call(adminBackupRouter.restore, { key: badKey }, { context: ctx })).rejects.toThrow(ORPCError)
    }
  })

  it('rejects concurrent restore requests', async () => {
    const lifecycle = await import('@/server/infra/lifecycle')
    vi.mocked(lifecycle.getRestoreState).mockReturnValueOnce({ phase: 'restoring' } as ReturnType<
      typeof lifecycle.getRestoreState
    >)
    const ctx = makeAuthedCtx()
    await expect(call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: ctx })).rejects.toThrow(
      ORPCError,
    )
  })
})
