import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { adminSession } from '#/_helpers/session'

function createTestApp(session = adminSession()) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    c.set('viewer' as never, { userId: '1', role: 'admin' } as never)
    c.set('clientAddress' as never, '127.0.0.1' as never)
    c.set('db' as never, {} as never)
    c.set('pool' as never, {} as never)
    await next()
  })
  return app
}

function mockCsrf() {
  vi.doMock('@/server/http/middlewares/csrf', () => ({
    csrfGuard: async (_c: unknown, next: () => Promise<void>) => next(),
  }))
}

function mockRateLimit() {
  vi.doMock('@/server/http/middlewares/rate-limit', () => ({
    rateLimitByIp: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
  }))
}

describe('backupRouter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    mockCsrf()
    mockRateLimit()
  })

  async function importRouter() {
    const { backupRouter } = await import('@/server/http/resources/backup')
    return backupRouter
  }

  it('returns restore status', async () => {
    vi.doMock('@/server/infra/lifecycle', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/server/infra/lifecycle')>()
      return {
        ...actual,
        getRestoreState: vi.fn().mockReturnValue({ phase: 'idle' }),
        resetRestoreState: vi.fn(),
      }
    })

    const router = await importRouter()
    const app = createTestApp()
    app.route('/', router)

    const res = await app.request('/api/admin/backup/restore-status')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ phase: 'idle' })
  })

  it('downloads a valid backup', async () => {
    vi.doMock('@/server/domains/backup/services/backup', () => ({
      buildBackupS3Key: vi.fn((timestamp: string) => `backup/${timestamp}`),
      getBackupBuffer: vi.fn().mockResolvedValue(Buffer.from('gzip-bytes')),
      isValidBackupKey: vi.fn().mockReturnValue(true),
    }))

    const router = await importRouter()
    const app = createTestApp()
    app.route('/', router)

    const res = await app.request('/api/admin/backup/download/20260617')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/gzip')
    expect(res.headers.get('Content-Disposition')).toContain('backup-20260617.sql.gz')
  })

  it('rejects invalid backup key for download', async () => {
    vi.doMock('@/server/domains/backup/services/backup', () => ({
      buildBackupS3Key: vi.fn(),
      getBackupBuffer: vi.fn(),
      isValidBackupKey: vi.fn().mockReturnValue(false),
    }))

    const router = await importRouter()
    const app = createTestApp()
    app.route('/', router)

    const res = await app.request('/api/admin/backup/download/bad..key')
    expect(res.status).toBe(400)
  })

  it('accepts admin upload-restore file', async () => {
    vi.doMock('@/server/infra/lifecycle', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/server/infra/lifecycle')>()
      return {
        ...actual,
        getRestoreState: vi.fn().mockReturnValue({ phase: 'idle' }),
        resetRestoreState: vi.fn(),
      }
    })
    vi.doMock('@/server/domains/backup/services/restore', () => ({
      extractBackupSql: vi.fn().mockResolvedValue('SQL'),
      restoreFromSql: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('@/server/domains/backup/services/validate', () => ({
      validateBackupSql: vi.fn(),
    }))
    vi.doMock('@/server/domains/backup/restore-orchestrator', () => ({
      performSafeRestore: vi.fn(),
    }))

    const router = await importRouter()
    const app = createTestApp()
    app.route('/', router)

    const form = new FormData()
    form.append('file', new File(['gz'], 'backup.sql.gz', { type: 'application/gzip' }))

    const res = await app.request('/api/admin/backup/upload-restore', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ accepted: true })
  })

  it('rejects admin upload-restore when another restore is running', async () => {
    vi.doMock('@/server/infra/lifecycle', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/server/infra/lifecycle')>()
      return {
        ...actual,
        getRestoreState: vi.fn().mockReturnValue({ phase: 'running' }),
        resetRestoreState: vi.fn(),
      }
    })

    const router = await importRouter()
    const app = createTestApp()
    app.route('/', router)

    const form = new FormData()
    form.append('file', new File(['gz'], 'backup.sql.gz', { type: 'application/gzip' }))

    const res = await app.request('/api/admin/backup/upload-restore', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(409)
  })

  it('rejects setup restore when admin already exists', async () => {
    vi.doMock('@/server/domains/users/services/admin', () => ({
      findFirstAdminUser: vi.fn(),
      hasAdmin: vi.fn().mockResolvedValue(true),
    }))

    const router = await importRouter()
    const app = createTestApp()
    app.route('/', router)

    const form = new FormData()
    form.append('file', new File(['gz'], 'backup.sql.gz', { type: 'application/gzip' }))

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(409)
  })

  it('rejects setup restore without verified setup token', async () => {
    vi.doMock('@/server/domains/users/services/admin', () => ({
      findFirstAdminUser: vi.fn(),
      hasAdmin: vi.fn().mockResolvedValue(false),
    }))

    const router = await importRouter()
    const app = createTestApp(adminSession())
    app.route('/', router)

    const form = new FormData()
    form.append('file', new File(['gz'], 'backup.sql.gz', { type: 'application/gzip' }))

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: form,
    })
    expect(res.status).toBe(403)
  })
})
