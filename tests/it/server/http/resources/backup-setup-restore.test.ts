import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'
import type { RequestContext } from '@/server/http/request-context'

import { makeRequestContext } from '#/_helpers/request-context'

const mockHasAdmin = vi.fn()
const mockFindFirstAdminUser = vi.fn()
const mockIsSetupTokenActive = vi.fn()
const mockValidateCsrfToken = vi.fn()

const mockRestoreFromStagedBackup = vi.fn()
const mockAssertStagedBackupContainsAdmin = vi.fn()
const mockStageBackup = vi.fn()
const mockStartRestoreJob = vi.fn()
const mockWithRestoreClaim = vi.fn()
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

vi.mock('@/server/domains/backup/services/restore', () => ({
  MAX_BACKUP_FILE_SIZE: 500 * 1024 * 1024,
  stageBackup: (...args: unknown[]) => mockStageBackup(...args),
  restoreFromStagedBackup: (...args: unknown[]) => mockRestoreFromStagedBackup(...args),
  assertStagedBackupContainsAdmin: (...args: unknown[]) => mockAssertStagedBackupContainsAdmin(...args),
}))

vi.mock('@/server/domains/backup/restore-machine', () => ({
  startRestoreJob: (...args: unknown[]) => mockStartRestoreJob(...args),
  withRestoreClaim: (...args: unknown[]) => mockWithRestoreClaim(...args),
}))

vi.mock('@/server/domains/settings/services/hydrate', () => ({
  refreshBlogSettings: (...args: unknown[]) => mockRefreshBlogSettings(...args),
}))

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
}))

vi.mock('@/server/infra/lifecycle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/lifecycle')>()
  return {
    ...actual,
  }
})

import { createSession } from 'react-router'

import type { BlogSessionData } from '@/server/domains/auth/session-storage'

function makeSession(data: Partial<BlogSessionData> = {}) {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
}

function makeRc(session: ReturnType<typeof makeSession>): RequestContext {
  return makeRequestContext({ session })
}

async function buildApp(session: ReturnType<typeof makeSession>) {
  const { backupRouter } = await import('@/server/http/resources/backup')
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', makeRc(session))
    await next()
  })
  app.route('/', backupRouter)
  return app
}

describe('/api/admin/backup/upload-restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The default honors the real contract: prepare → start → 'started'.
    mockWithRestoreClaim.mockImplementation(
      async (
        prepare: () => Promise<{
          restoreFn: () => Promise<void>
          afterReopenFn?: (db: unknown) => Promise<void>
        } | null>,
      ) => {
        const job = await prepare()
        if (job === null) {
          return 'declined'
        }
        await mockStartRestoreJob(job.restoreFn, job.afterReopenFn)
        return 'started'
      },
    )
    mockValidateCsrfToken.mockReturnValue(true)
    mockAssertStagedBackupContainsAdmin.mockResolvedValue(undefined)
    mockStageBackup.mockResolvedValue({
      dir: '/tmp/fake-staged',
      content: '/tmp/fake-staged/kobato.db',
      analytics: null,
    })
    mockStartRestoreJob.mockImplementation(
      async (fn: () => Promise<void>, afterReopenFn?: (db: unknown) => Promise<void>) => {
        await fn()
        // The real machine passes the freshly reopened handle.
        await afterReopenFn?.({ fake: 'db' })
      },
    )
  })

  it('returns 403 when CSRF token is missing or invalid', async () => {
    mockValidateCsrfToken.mockReturnValue(false)
    const { backupRouter } = await import('@/server/http/resources/backup')
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set(
        'requestContext',
        makeRc(
          makeSession({
            csrfToken: 'valid-csrf',
            user: { id: '1', name: 'Admin', email: 'admin@test.com', website: null, role: 'admin' },
          }),
        ),
      )
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
        'requestContext',
        makeRc(
          makeSession({
            csrfToken: 'valid-csrf',
            user: { id: '1', name: 'Admin', email: 'admin@test.com', website: null, role: 'admin' },
          }),
        ),
      )
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

  it('returns 409 when a restore is already running', async () => {
    mockWithRestoreClaim.mockResolvedValueOnce('busy')
    const { backupRouter } = await import('@/server/http/resources/backup')
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set(
        'requestContext',
        makeRc(
          makeSession({
            csrfToken: 'valid-csrf',
            user: { id: '1', name: 'Admin', email: 'admin@test.com', website: null, role: 'admin' },
          }),
        ),
      )
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

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('已有还原任务正在进行，请等待完成后再试。')
  })
})

describe('/api/setup/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The default honors the real contract: prepare → start → 'started'.
    mockWithRestoreClaim.mockImplementation(
      async (
        prepare: () => Promise<{
          restoreFn: () => Promise<void>
          afterReopenFn?: (db: unknown) => Promise<void>
        } | null>,
      ) => {
        const job = await prepare()
        if (job === null) {
          return 'declined'
        }
        await mockStartRestoreJob(job.restoreFn, job.afterReopenFn)
        return 'started'
      },
    )
    mockHasAdmin.mockResolvedValue(false)
    mockIsSetupTokenActive.mockResolvedValue(true)
    mockValidateCsrfToken.mockReturnValue(true)
    mockAssertStagedBackupContainsAdmin.mockResolvedValue(undefined)
    mockStageBackup.mockResolvedValue({
      dir: '/tmp/fake-staged',
      content: '/tmp/fake-staged/kobato.db',
      analytics: null,
    })
    mockFindFirstAdminUser.mockResolvedValue({ id: 1, role: 'admin' })
    mockStartRestoreJob.mockImplementation(
      async (fn: () => Promise<void>, afterReopenFn?: (db: unknown) => Promise<void>) => {
        await fn()
        // The real machine passes the freshly reopened handle.
        await afterReopenFn?.({ fake: 'db' })
      },
    )
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

  it('returns 403 when setup token has expired', async () => {
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

  it('returns accepted on successful restore — and applies content only (withAnalytics: false)', async () => {
    const app = await buildApp(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' }))
    const formData = new FormData()
    formData.set('file', new File(['content'], 'test.db.tar.gz'))

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { accepted: boolean }
    expect(body.accepted).toBe(true)
    expect(mockStartRestoreJob).toHaveBeenCalledOnce()
    // The setup restore applies the content database only — a fresh
    // install never inherits an old site's telemetry.
    expect(mockRestoreFromStagedBackup).toHaveBeenCalledWith(
      expect.objectContaining({ dir: expect.any(String) }),
      'test.db.tar.gz',
      { withAnalytics: false },
    )
  })

  it('returns 409 when a restore is already running', async () => {
    mockWithRestoreClaim.mockResolvedValueOnce('busy')
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
    expect(body.error.message).toBe('已有还原任务正在进行，请等待完成后再试。')
  })
})
