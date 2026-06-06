import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

const mockHasAdmin = vi.fn()
const mockFindFirstAdminUser = vi.fn()
const mockIsSetupTokenActive = vi.fn()
const mockValidateCsrfToken = vi.fn()
const mockCheckPgToolsAvailable = vi.fn()
const mockExtractBackupSql = vi.fn()
const mockRestoreFromSql = vi.fn()
const mockValidateBackupSql = vi.fn()
const mockPerformSafeRestore = vi.fn()
const mockRefreshBlogSettings = vi.fn()
const mockRecordAuditEvent = vi.fn()

vi.mock('@/server/infra/db/operations/user', () => ({
  hasAdmin: (...args: unknown[]) => mockHasAdmin(...args),
  findFirstAdminUser: (...args: unknown[]) => mockFindFirstAdminUser(...args),
}))

vi.mock('@/server/domains/auth/setup-token', () => ({
  isSetupTokenActive: (...args: unknown[]) => mockIsSetupTokenActive(...args),
}))

vi.mock('@/server/domains/auth/csrf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/auth/csrf')>()
  return {
    ...actual,
    validateCsrfToken: (...args: unknown[]) => mockValidateCsrfToken(...args),
    CSRF_HEADER: 'x-csrf-token',
  }
})

vi.mock('@/server/http/middlewares/rate-limit', () => ({
  rateLimitByIp: vi.fn(() => async (_c: unknown, next: () => unknown) => next()),
}))

vi.mock('@/server/domains/backup/services/shared', () => ({
  checkPgToolsAvailable: (...args: unknown[]) => mockCheckPgToolsAvailable(...args),
}))

vi.mock('@/server/domains/backup/services/restore', () => ({
  extractBackupSql: (...args: unknown[]) => mockExtractBackupSql(...args),
  restoreFromSql: (...args: unknown[]) => mockRestoreFromSql(...args),
}))

vi.mock('@/server/domains/backup/services/validate', () => ({
  validateBackupSql: (...args: unknown[]) => mockValidateBackupSql(...args),
}))

vi.mock('@/server/domains/backup/restore-orchestrator', () => ({
  performSafeRestore: (...args: unknown[]) => mockPerformSafeRestore(...args),
}))

vi.mock('@/server/domains/settings/snapshot', () => ({
  refreshBlogSettings: (...args: unknown[]) => mockRefreshBlogSettings(...args),
}))

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
}))

import { createSession } from 'react-router'

import type { BlogSessionData } from '@/server/domains/auth/session-storage'

function makeSession(data: Partial<BlogSessionData> = {}) {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
}

async function buildApp(session: ReturnType<typeof makeSession>) {
  const { backupRouter } = await import('@/server/http/resources/backup')
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('session', session as unknown as Env['Variables']['session'])
    c.set('clientAddress', '127.0.0.1')
    c.set('db', {} as Env['Variables']['db'])
    c.set('pool', {} as Env['Variables']['pool'])
    await next()
  })
  app.route('/', backupRouter)
  return app
}

describe('/api/admin/backup/upload-restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateCsrfToken.mockReturnValue(true)
    mockExtractBackupSql.mockResolvedValue('CREATE TABLE test (id INT);')
    mockPerformSafeRestore.mockImplementation(async (_ctx: unknown, fn: () => Promise<void>) => {
      await fn()
    })
  })

  it('returns 403 when CSRF token is missing or invalid', async () => {
    mockValidateCsrfToken.mockReturnValue(false)
    const { backupRouter } = await import('@/server/http/resources/backup')
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set(
        'session',
        makeSession({
          csrfToken: 'valid-csrf',
          user: { id: '1', name: 'Admin', email: 'admin@test.com', website: null, role: 'admin' },
        }) as unknown as Env['Variables']['session'],
      )
      c.set('clientAddress', '127.0.0.1')
      c.set('db', {} as Env['Variables']['db'])
      c.set('pool', {} as Env['Variables']['pool'])
      await next()
    })
    app.route('/', backupRouter)

    const formData = new FormData()
    formData.set('file', new File(['content'], 'test.sql'))

    const res = await app.request('/api/admin/backup/upload-restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'invalid-csrf' },
    })

    expect(res.status).toBe(403)
  })

  it('accepts upload when CSRF token is valid', async () => {
    const { backupRouter } = await import('@/server/http/resources/backup')
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set(
        'session',
        makeSession({
          csrfToken: 'valid-csrf',
          user: { id: '1', name: 'Admin', email: 'admin@test.com', website: null, role: 'admin' },
        }) as unknown as Env['Variables']['session'],
      )
      c.set('clientAddress', '127.0.0.1')
      c.set('db', {} as Env['Variables']['db'])
      c.set('pool', {} as Env['Variables']['pool'])
      await next()
    })
    app.route('/', backupRouter)

    const formData = new FormData()
    formData.set('file', new File(['content'], 'test.sql'))

    const res = await app.request('/api/admin/backup/upload-restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { accepted: boolean }
    expect(body.accepted).toBe(true)
  })
})

describe('/api/setup/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasAdmin.mockResolvedValue(false)
    mockIsSetupTokenActive.mockResolvedValue(true)
    mockValidateCsrfToken.mockReturnValue(true)
    mockCheckPgToolsAvailable.mockResolvedValue(true)
    mockExtractBackupSql.mockResolvedValue('CREATE TABLE test (id INT);')
    mockFindFirstAdminUser.mockResolvedValue({ id: 1n, role: 'admin' })
    mockPerformSafeRestore.mockImplementation(async (_ctx: unknown, fn: () => Promise<void>) => {
      await fn()
    })
  })

  it('returns 403 when session is not verified', async () => {
    const app = await buildApp(makeSession({}))
    const formData = new FormData()
    formData.set('file', new File(['content'], 'test.sql'))

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: formData,
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('Setup Token 验证已过期或未完成，请先返回安装页面完成验证。')
  })

  it('returns 403 when setup token has expired in Redis', async () => {
    mockIsSetupTokenActive.mockResolvedValue(false)
    const app = await buildApp(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' }))
    const formData = new FormData()
    formData.set('file', new File(['content'], 'test.sql'))

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('Setup Token 已过期或失效，请重新验证。')
  })

  it('returns 403 when CSRF token is invalid', async () => {
    mockValidateCsrfToken.mockReturnValue(false)
    const app = await buildApp(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' }))
    const formData = new FormData()
    formData.set('file', new File(['content'], 'test.sql'))

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'invalid-csrf' },
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('安全校验失败，请刷新页面后重试。')
  })

  it('returns 409 when admin already exists', async () => {
    mockHasAdmin.mockResolvedValue(true)
    const app = await buildApp(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' }))
    const formData = new FormData()
    formData.set('file', new File(['content'], 'test.sql'))

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('站点已安装，请直接登录后通过后台还原备份。')
  })

  it('returns accepted on successful restore', async () => {
    const app = await buildApp(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' }))
    const formData = new FormData()
    formData.set('file', new File(['content'], 'test.sql'))

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { accepted: boolean }
    expect(body.accepted).toBe(true)
    expect(mockPerformSafeRestore).toHaveBeenCalledOnce()
  })
})
