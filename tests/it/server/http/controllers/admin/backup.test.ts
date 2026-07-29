import { call, ORPCError } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/backup/services/backup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/backup/services/backup')>()
  return {
    ...actual,
    createBackup: vi.fn(),
    deleteBackup: vi.fn(),
    getBackupBuffer: vi.fn(),
    getBackupStream: vi.fn(),
    listBackups: vi.fn(),
  }
})

vi.mock('@/server/domains/backup/services/restore', () => ({
  stageBackup: vi.fn(async () => ({ dir: '/tmp/staged', content: '/tmp/staged/kobato.db', analytics: null })),
  restoreFromStagedBackup: vi.fn(async () => undefined),
}))

vi.mock('@/server/domains/backup/restore-machine', () => ({
  startRestoreJob: vi.fn(),
  // The default honors the real contract (prepare → start → 'started');
  // individual cases override with 'busy'.
  withRestoreClaim: vi.fn(
    async (
      prepare: () => Promise<{
        restoreFn: () => Promise<void>
        afterReopenFn?: () => Promise<void>
      } | null>,
    ) => {
      const job = await prepare()
      if (job === null) {
        return 'declined'
      }
      const machine = await import('@/server/domains/backup/restore-machine')
      machine.startRestoreJob(job.restoreFn, job.afterReopenFn)
      return 'started'
    },
  ),
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
  setRestartDb: vi.fn(),
  setRestartRefreshSettings: vi.fn(),
}))

const backupService = await import('@/server/domains/backup/services/backup')
const restoreMachine = await import('@/server/domains/backup/restore-machine')
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
    const { Readable } = await import('node:stream')
    vi.mocked(backupService.getBackupStream).mockResolvedValueOnce(Readable.from(['archive-bytes']))
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: ctx })
    expect(res).toEqual({ accepted: true })
    expect(restoreMachine.startRestoreJob).toHaveBeenCalledWith(expect.any(Function), expect.any(Function))
  })

  it('rejects invalid key formats', async () => {
    const ctx = makeAuthedCtx()
    for (const badKey of ['../etc/passwd', 'backup/../../secret', 'backup/x.sql.gz', '']) {
      await expect(call(adminBackupRouter.restore, { key: badKey }, { context: ctx })).rejects.toThrow(ORPCError)
    }
  })

  it('rejects concurrent restore requests', async () => {
    vi.mocked(restoreMachine.withRestoreClaim).mockResolvedValueOnce('busy')
    const ctx = makeAuthedCtx()
    await expect(call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: ctx })).rejects.toThrow(
      ORPCError,
    )
  })
})
