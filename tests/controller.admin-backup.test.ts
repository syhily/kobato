import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { makeAuthedCtx } from './_helpers/mock-ctx'

vi.mock('@/server/domains/backup/service', () => ({
  checkPgToolsAvailable: vi.fn(),
  createBackup: vi.fn(),
  deleteBackup: vi.fn(),
  getBackupBuffer: vi.fn(),
  listBackups: vi.fn(),
  restoreFromBackup: vi.fn(),
}))

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(),
}))

vi.mock('@/server/infra/shutdown', () => ({
  requestShutdown: vi.fn(),
  registerShutdownHook: vi.fn(),
  setRestartState: vi.fn(),
}))

vi.mock('@/server/infra/restart', () => ({
  restartServer: vi.fn(),
}))

const service = await import('@/server/domains/backup/service')
const blogConfig = await import('@/shared/config/getters')
const { adminBackupRouter } = await import('@/server/http/controllers/admin/backup.controller')

describe('adminBackupRouter.status', () => {
  it('returns s3Enabled and pgToolsAvailable', async () => {
    vi.mocked(blogConfig.getBlogSettingsBundleSync).mockReturnValue({
      assets: { storage: { enabled: true } },
    } as unknown as BlogSettingsBundle)
    vi.mocked(service.checkPgToolsAvailable).mockResolvedValueOnce(true)
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.status, undefined, { context: ctx })
    expect(res).toEqual({ s3Enabled: true, pgToolsAvailable: true })
  })
})

describe('adminBackupRouter.list', () => {
  it('returns files array', async () => {
    const files = [
      {
        key: 'backup/2026-01-01.sql.gz',
        fileName: '2026-01-01.sql.gz',
        size: 1024,
        lastModified: '2026-01-01T00:00:00.000Z',
      },
    ]
    vi.mocked(service.listBackups).mockResolvedValueOnce({ files, nextContinuationToken: undefined })
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.list, undefined, { context: ctx })
    expect(res.files).toHaveLength(1)
    expect(res.files[0].fileName).toBe('2026-01-01.sql.gz')
    expect(res.nextContinuationToken).toBeUndefined()
  })
})

describe('adminBackupRouter.create', () => {
  it('returns fileName and size on success', async () => {
    vi.mocked(service.createBackup).mockResolvedValueOnce({
      fileName: '2026-01-01.sql.gz',
      size: 2048,
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.create, undefined, { context: ctx })
    expect(res).toEqual({ fileName: '2026-01-01.sql.gz', size: 2048 })
  })
})

describe('adminBackupRouter.delete', () => {
  it('returns success after deleting backup', async () => {
    vi.mocked(service.deleteBackup).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.delete, { key: 'backup/2026-01-01.sql.gz' }, { context: ctx })
    expect(res).toEqual({ success: true })
  })
})

describe('adminBackupRouter.restore', () => {
  it('returns accepted after restoring backup', async () => {
    const buffer = Buffer.from('sql')
    vi.mocked(service.getBackupBuffer).mockResolvedValueOnce(buffer)
    vi.mocked(service.restoreFromBackup).mockResolvedValueOnce(undefined)
    const ctx = makeAuthedCtx()
    const res = await call(adminBackupRouter.restore, { key: 'backup/2026-01-01.sql.gz' }, { context: ctx })
    expect(res).toEqual({ accepted: true })
    expect(service.restoreFromBackup).toHaveBeenCalledWith(buffer, 'backup/2026-01-01.sql.gz')
  })
})
