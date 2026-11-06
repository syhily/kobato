import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { Env } from '@/server/http/context'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { makeRequestContext } from '#/_helpers/request-context'
import { adminSession } from '#/_helpers/session'
import { onErrorHandler } from '@/server/http/errors'
import { insertBackup } from '@/server/infra/db/operations/backup'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// Keep the process/restart boundary inert — the download route never restores.
vi.mock('@/server/infra/lifecycle', () => ({
  requestShutdown: vi.fn(),
  registerShutdownHook: vi.fn(),
  unregisterShutdownHook: vi.fn(),
  setServerPhase: vi.fn(),
  restartServer: vi.fn(),
  setRestartGetDb: vi.fn(),
  setRestartRefreshSettings: vi.fn(),
}))

// Real router + getBackupStream against the shared in-memory backend — no S3, no settings.
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

async function buildApp(session: BlogSession = adminSession()) {
  const { backupRouter } = await import('@/server/http/resources/backup')
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', makeRequestContext({ session, db }))
    await next()
  })
  app.route('/', backupRouter)
  // ActionFailure → its HTTP status, exactly like the real app.
  app.onError(onErrorHandler)
  return app
}

describe('/api/admin/backup/download/:timestamp', () => {
  it('rejects an invalid backup key', async () => {
    const app = await buildApp()
    const res = await app.request('/api/admin/backup/download/not-a-timestamp')
    expect(res.status).toBe(400)
  })

  it('streams the archive through the stream channel, never the 100MB-capped buffer read', async () => {
    // Row records a >100MB size while the in-memory object stands in for the bytes —
    // the assertion is on the stream channel (getStream vs get), not payload size.
    const byteSize = 150 * 1024 * 1024
    const payload = Buffer.from('fake-gzip-archive-bytes')
    await mem.backend.put({ key: STORAGE_KEY, body: payload, contentType: 'application/gzip' })
    await insertBackup(db, { timestamp: TIMESTAMP, storagePath: STORAGE_KEY, storageDriver: 's3', byteSize })
    const getSpy = vi.spyOn(mem.backend, 'get')
    const getStreamSpy = vi.spyOn(mem.backend, 'getStream')

    const app = await buildApp()
    const res = await app.request(`/api/admin/backup/download/${TIMESTAMP}`)

    expect(res.status).toBe(200)
    expect(getStreamSpy).toHaveBeenCalledOnce()
    expect(getStreamSpy).toHaveBeenCalledWith(STORAGE_KEY)
    expect(getSpy).not.toHaveBeenCalled()

    expect(res.headers.get('Content-Type')).toBe('application/gzip')
    expect(res.headers.get('Content-Disposition')).toBe(`attachment; filename="backup-${TIMESTAMP}.db.tar.gz"`)
    // Content-Length comes from the recorded upload size, not the drained body.
    expect(res.headers.get('Content-Length')).toBe(String(byteSize))

    const body = Buffer.from(await res.arrayBuffer())
    expect(body.equals(payload)).toBe(true)
  })

  it('refuses a row whose storage_path is not a backup key (a restored DB can forge it)', async () => {
    const ASSET_KEY = 'images/2026/05/live.jpg'
    await mem.backend.put({ key: ASSET_KEY, body: Buffer.from('asset-bytes'), contentType: 'image/jpeg' })
    await insertBackup(db, { timestamp: TIMESTAMP, storagePath: ASSET_KEY, storageDriver: 's3', byteSize: 11 })

    const app = await buildApp()
    const res = await app.request(`/api/admin/backup/download/${TIMESTAMP}`)

    expect(res.status).toBe(400)
    // The object it names was never opened.
    expect(mem.store.has(ASSET_KEY)).toBe(true)
  })
})
