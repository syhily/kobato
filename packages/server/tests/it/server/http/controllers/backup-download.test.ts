import { insertBackup } from '@kobato/db/sqlite/operations/system/backup'
import { adminBackupRouter } from '@kobato/server/http/controllers/admin/backup.controller'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()
const mem = makeMemoryBackend({ driver: 's3' })

const TIMESTAMP = '2026-01-01T00-00-00'
const STORAGE_KEY = `backup/backup-${TIMESTAMP}.db.tar.gz`

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  await clearAllTables(db)
})

afterEach(() => {
  __resetStorageBackendsForTests()
  mem.reset()
  vi.restoreAllMocks()
})

async function download(key: string): Promise<Response> {
  const context = makeAuthedCtx({ db })
  const body = await call(adminBackupRouter.download, { key }, { context })
  return new Response(body, { headers: context.responseHeaders })
}

describe('admin.backup.download', () => {
  it('rejects an invalid backup key', async () => {
    const context = makeAuthedCtx({ db })
    await expect(call(adminBackupRouter.download, { key: 'not-a-timestamp' }, { context })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('streams the archive through the stream channel, never the 100MB-capped buffer read', async () => {
    const byteSize = 150 * 1024 * 1024
    const payload = Buffer.from('fake-gzip-archive-bytes')
    await mem.backend.put({ key: STORAGE_KEY, body: payload, contentType: 'application/gzip' })
    await insertBackup(db, { timestamp: TIMESTAMP, storagePath: STORAGE_KEY, storageDriver: 's3', byteSize })
    const getSpy = vi.spyOn(mem.backend, 'get')
    const getStreamSpy = vi.spyOn(mem.backend, 'getStream')

    const res = await download(TIMESTAMP)

    expect(res.status).toBe(200)
    expect(getStreamSpy).toHaveBeenCalledOnce()
    expect(getStreamSpy).toHaveBeenCalledWith(STORAGE_KEY)
    expect(getSpy).not.toHaveBeenCalled()
    expect(res.headers.get('Content-Type')).toBe('application/gzip')
    expect(res.headers.get('Content-Disposition')).toBe(`attachment; filename="backup-${TIMESTAMP}.db.tar.gz"`)
    expect(res.headers.get('Content-Length')).toBe(String(byteSize))
    const body = Buffer.from(await res.arrayBuffer())
    expect(body.equals(payload)).toBe(true)
  })

  it('refuses a row whose storage_path is not a backup key (a restored DB can forge it)', async () => {
    const assetKey = 'images/2026/05/live.jpg'
    await mem.backend.put({ key: assetKey, body: Buffer.from('asset-bytes'), contentType: 'image/jpeg' })
    await insertBackup(db, { timestamp: TIMESTAMP, storagePath: assetKey, storageDriver: 's3', byteSize: 11 })

    const context = makeAuthedCtx({ db })
    await expect(call(adminBackupRouter.download, { key: TIMESTAMP }, { context })).rejects.toMatchObject({
      status: 400,
    })
    expect(mem.store.has(assetKey)).toBe(true)
  })
})
