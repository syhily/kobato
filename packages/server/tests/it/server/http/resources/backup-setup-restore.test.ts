import type { Database } from '@kobato/db/database.ts'
import type { Env } from '@kobato/server/http/hono-env.ts'
import type { RequestContext } from '@kobato/server/http/request-context.ts'

import { user as userTable } from '@kobato/db/schema/user.ts'
import { ActionFailure } from '@kobato/server/infra/http/errors.ts'
import { clearAllTables, createTestDatabaseFile, getTestDb } from '@kobato/test/integration-db.ts'
import { makeRequestContext } from '@kobato/test/request-context.ts'
import { Hono } from 'hono'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockIsSetupTokenActive = vi.fn()
const mockValidateCsrfToken = vi.fn()

const mockRestoreFromStagedBackup = vi.fn()
const mockAssertStagedBackupContainsAdmin = vi.fn()
const mockStageBackup = vi.fn()
const mockStartRestoreJob = vi.fn()
const mockWithRestoreClaim = vi.fn()
const mockRecordAuditEvent = vi.fn()

vi.mock('@kobato/server/domains/auth/setup-token.ts', () => ({
  isSetupTokenActive: (...args: unknown[]) => mockIsSetupTokenActive(...args),
}))

vi.mock('@kobato/server/domains/auth/csrf.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/domains/auth/csrf.ts')>()
  return {
    ...actual,
    validateCsrfToken: (...args: unknown[]) => mockValidateCsrfToken(...args),
    CSRF_HEADER: 'x-csrf-token',
  }
})

vi.mock('@kobato/server/http/middlewares/rate-limit.ts', () => ({
  rateLimitByIp: vi.fn(() => async (_c: unknown, next: () => unknown) => next()),
}))

vi.mock('@kobato/server/domains/backup/services/restore.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/domains/backup/services/restore.ts')>()
  return {
    ...actual,
    stageBackup: (...args: unknown[]) => mockStageBackup(...args),
    restoreFromStagedBackup: (...args: unknown[]) => mockRestoreFromStagedBackup(...args),
    assertStagedBackupContainsAdmin: (...args: unknown[]) => mockAssertStagedBackupContainsAdmin(...args),
    sweepStaleRestoreDirs: vi.fn(async () => {}),
    cleanupPreRestoreFiles: vi.fn(async () => {}),
    recoverPreRestoreFiles: vi.fn(async () => {}),
  }
})

vi.mock('@kobato/server/domains/backup/restore-machine.ts', () => ({
  startRestoreJob: (...args: unknown[]) => mockStartRestoreJob(...args),
  withRestoreClaim: (...args: unknown[]) => mockWithRestoreClaim(...args),
  wireRestoreMachine: () => undefined,
  peekRestoreJobPhase: () => ({ phase: 'idle', error: null }),
  consumeRestoreJobReport: () => ({ phase: 'idle', error: null }),
}))

vi.mock('@kobato/server/domains/audit/services/record.ts', () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
}))

import type { BlogSessionData } from '@kobato/server/domains/auth/session-storage.ts'

import { createSession } from 'react-router'

function makeSession(data: Partial<BlogSessionData> = {}) {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
}

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedAdmin(target: Database = db): Promise<number> {
  const rows = await target
    .insert(userTable)
    .values({
      name: 'Admin',
      email: `admin-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      role: 'admin',
    })
    .returning({ id: userTable.id })
  return rows[0]!.id
}

function makeRc(session: ReturnType<typeof makeSession>): RequestContext {
  return makeRequestContext({ session, db })
}

async function buildApp(session: ReturnType<typeof makeSession>) {
  const { backupRouter } = await import('@kobato/server/http/resources/backup.ts')
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', makeRc(session))
    await next()
  })
  app.route('/', backupRouter)
  return app
}

async function buildAdminApp() {
  return buildApp(
    makeSession({
      csrfToken: 'valid-csrf',
      user: { id: '1', name: 'Admin', email: 'admin@test.com', website: null, role: 'admin' },
    }),
  )
}

async function makePasswordRequiredError(dir: string): Promise<Error> {
  const restoreModule = await import('@kobato/server/domains/backup/services/restore.ts')
  const uploadPath = join(dir, 'upload.bin')
  writeFileSync(uploadPath, 'raw-encrypted-bytes')
  return new restoreModule.EncryptedBackupPasswordRequired(dir, uploadPath)
}

describe('/api/admin/backup/upload-restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    mockRestoreFromStagedBackup.mockResolvedValue({ configApplied: false })
    mockStageBackup.mockResolvedValue({
      dir: '/tmp/fake-staged',
      content: '/tmp/fake-staged/kobato.db',
      analytics: null,
    })
    mockStartRestoreJob.mockImplementation(
      async (fn: () => Promise<void>, afterReopenFn?: (db: unknown) => Promise<void>) => {
        await fn()
        await afterReopenFn?.(db)
      },
    )
  })

  it('returns 403 when CSRF token is missing or invalid', async () => {
    mockValidateCsrfToken.mockReturnValue(false)
    const { backupRouter } = await import('@kobato/server/http/resources/backup.ts')
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

  it('returns 400 and never claims the slot when the staged backup fails the content check', async () => {
    mockAssertStagedBackupContainsAdmin.mockRejectedValueOnce(new Error('file is not a database'))
    const { backupRouter } = await import('@kobato/server/http/resources/backup.ts')
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
    formData.set('file', new File(['content'], 'test.db'))

    const res = await app.request('/api/admin/backup/upload-restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('备份文件无效或不包含管理员账号。')
    expect(mockWithRestoreClaim).not.toHaveBeenCalled()
    expect(mockStartRestoreJob).not.toHaveBeenCalled()
  })

  it('skips the content check for analytics-only uploads', async () => {
    mockStageBackup.mockResolvedValue({
      dir: '/tmp/fake-staged',
      content: null,
      analytics: '/tmp/fake-staged/analytics.duckdb',
    })
    const { backupRouter } = await import('@kobato/server/http/resources/backup.ts')
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
    formData.set('file', new File(['content'], 'analytics.duckdb'))

    const res = await app.request('/api/admin/backup/upload-restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(200)
    expect(mockAssertStagedBackupContainsAdmin).not.toHaveBeenCalled()
  })

  it('accepts upload when CSRF token is valid', async () => {
    const { backupRouter } = await import('@kobato/server/http/resources/backup.ts')
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
    const { backupRouter } = await import('@kobato/server/http/resources/backup.ts')
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
  it('parks an encrypted upload; the decrypt endpoint completes the restore and a wrong password keeps the token', async () => {
    const parkedDir = mkdtempSync(join(tmpdir(), 'kobato-restore-'))
    mockStageBackup.mockRejectedValueOnce(await makePasswordRequiredError(parkedDir))
    const app = await buildAdminApp()

    const formData = new FormData()
    formData.set('file', new File(['encrypted-bytes'], 'backup.db.tar.gz.enc'))
    const res = await app.request('/api/admin/backup/upload-restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { encrypted: boolean; token: string }
    expect(body.encrypted).toBe(true)
    expect(typeof body.token).toBe('string')
    expect(mockWithRestoreClaim).not.toHaveBeenCalled()

    const { peekEncryptedUpload, resetPendingEncryptedUploads } =
      await import('@kobato/server/domains/backup/pending-uploads.ts')
    try {
      const restoreModule = await import('@kobato/server/domains/backup/services/restore.ts')
      mockStageBackup.mockImplementationOnce(async (source: unknown) => {
        if (source instanceof Readable) {
          source.on('error', () => {})
          source.destroy()
        }
        throw new restoreModule.BackupPasswordError()
      })
      const wrong = await app.request('/api/admin/backup/upload-restore/decrypt', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': 'valid-csrf' },
        body: JSON.stringify({ token: body.token, password: 'wrong-password' }),
      })
      expect(wrong.status).toBe(400)
      expect(((await wrong.json()) as { error: { message: string } }).error.message).toBe('备份密码错误或文件已损坏')
      expect(peekEncryptedUpload(body.token)).not.toBeNull()

      mockStageBackup.mockImplementationOnce(async (source: unknown) => {
        if (source instanceof Readable) {
          source.on('error', () => {})
          source.destroy()
        }
        return {
          dir: parkedDir,
          content: join(parkedDir, 'kobato.db'),
          analytics: null,
          config: null,
        }
      })
      const right = await app.request('/api/admin/backup/upload-restore/decrypt', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': 'valid-csrf' },
        body: JSON.stringify({ token: body.token, password: 'right-password' }),
      })
      expect(right.status).toBe(200)
      expect(((await right.json()) as { accepted: boolean }).accepted).toBe(true)
      expect(peekEncryptedUpload(body.token)).toBeNull()
      expect(mockWithRestoreClaim).toHaveBeenCalledOnce()
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'backup_restored',
          resourceType: 'backup',
          resourceId: 'backup.db.tar.gz.enc',
        }),
      )
    } finally {
      resetPendingEncryptedUploads()
      rmSync(parkedDir, { recursive: true, force: true })
    }
  })

  it('rejects a decrypt call with an unknown or expired token as 410 (distinct from a wrong password)', async () => {
    const app = await buildAdminApp()
    const res = await app.request('/api/admin/backup/upload-restore/decrypt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'valid-csrf' },
      body: JSON.stringify({ token: 'no-such-token', password: 'whatever' }),
    })
    expect(res.status).toBe(410)
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      '上传会话已过期，请重新上传备份文件。',
    )
  })

  it('releases the token with 410 when staging fails for a NON-password reason (retrying could never help)', async () => {
    const parkedDir = mkdtempSync(join(tmpdir(), 'kobato-restore-'))
    mockStageBackup.mockRejectedValueOnce(await makePasswordRequiredError(parkedDir))
    const app = await buildAdminApp()
    const formData = new FormData()
    formData.set('file', new File(['encrypted-bytes'], 'backup.db.tar.gz.enc'))
    const res = await app.request('/api/admin/backup/upload-restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })
    const body = (await res.json()) as { encrypted: boolean; token: string }

    const { peekEncryptedUpload, resetPendingEncryptedUploads } =
      await import('@kobato/server/domains/backup/pending-uploads.ts')
    try {
      mockStageBackup.mockImplementationOnce(async (source: unknown) => {
        if (source instanceof Readable) {
          source.on('error', () => {})
          source.destroy()
        }
        throw new ActionFailure(400, '备份归档中缺少内容数据库 kobato.db')
      })
      const failed = await app.request('/api/admin/backup/upload-restore/decrypt', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': 'valid-csrf' },
        body: JSON.stringify({ token: body.token, password: 'any-password' }),
      })
      expect(failed.status).toBe(410)
      expect(((await failed.json()) as { error: { message: string } }).error.message).toBe(
        '备份归档中缺少内容数据库 kobato.db',
      )
      expect(peekEncryptedUpload(body.token)).toBeNull()
    } finally {
      resetPendingEncryptedUploads()
      rmSync(parkedDir, { recursive: true, force: true })
    }
  })

  it('keeps the parked token when the decrypt staging wins but the restore slot is busy (409)', async () => {
    const parkedDir = mkdtempSync(join(tmpdir(), 'kobato-restore-'))
    mockStageBackup.mockRejectedValueOnce(await makePasswordRequiredError(parkedDir))
    const app = await buildAdminApp()
    const formData = new FormData()
    formData.set('file', new File(['encrypted-bytes'], 'backup.db.tar.gz.enc'))
    const res = await app.request('/api/admin/backup/upload-restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })
    const body = (await res.json()) as { encrypted: boolean; token: string }

    const { peekEncryptedUpload, resetPendingEncryptedUploads } =
      await import('@kobato/server/domains/backup/pending-uploads.ts')
    try {
      mockStageBackup.mockImplementationOnce(async (source: unknown) => {
        if (source instanceof Readable) {
          source.on('error', () => {})
          source.destroy()
        }
        return {
          dir: '/tmp/fake-staged-busy',
          content: '/tmp/fake-staged-busy/kobato.db',
          analytics: null,
          config: null,
        }
      })
      mockWithRestoreClaim.mockResolvedValueOnce('busy')
      const busy = await app.request('/api/admin/backup/upload-restore/decrypt', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': 'valid-csrf' },
        body: JSON.stringify({ token: body.token, password: 'right-password' }),
      })
      expect(busy.status).toBe(409)
      const parked = peekEncryptedUpload(body.token)
      expect(parked).not.toBeNull()
      expect(parked!.inFlight).toBe(false)
    } finally {
      resetPendingEncryptedUploads()
      rmSync(parkedDir, { recursive: true, force: true })
    }
  })

  it('rejects a decrypt call whose token expired past the 10-minute TTL as 410', async () => {
    const app = await buildAdminApp()
    const { parkEncryptedUpload, resetPendingEncryptedUploads } =
      await import('@kobato/server/domains/backup/pending-uploads.ts')
    vi.useFakeTimers()
    try {
      const dir = join(tmpdir(), 'kobato-restore-expired-token')
      const token = parkEncryptedUpload({ dir, uploadPath: join(dir, 'upload.bin'), fileName: 'backup.db.tar.gz.enc' })
      vi.advanceTimersByTime(11 * 60 * 1000)

      const res = await app.request('/api/admin/backup/upload-restore/decrypt', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': 'valid-csrf' },
        body: JSON.stringify({ token, password: 'any-password' }),
      })
      expect(res.status).toBe(410)
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
        '上传会话已过期，请重新上传备份文件。',
      )
    } finally {
      vi.useRealTimers()
      resetPendingEncryptedUploads()
    }
  })

  it('rejects a decrypt call with an empty token or an empty password as 400', async () => {
    const app = await buildAdminApp()
    for (const payload of [
      { token: '', password: 'some-password' },
      { token: 'some-token', password: '' },
    ]) {
      const res = await app.request('/api/admin/backup/upload-restore/decrypt', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': 'valid-csrf' },
        body: JSON.stringify(payload),
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe('请提供备份密码')
    }
  })

  it('reports the merged restore progress snapshot', async () => {
    const app = await buildAdminApp()
    const res = await app.request('/api/admin/backup/restore-progress')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ stage: 'idle', percent: null })
  })
})

describe('/api/setup/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    mockIsSetupTokenActive.mockResolvedValue(true)
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
        await afterReopenFn?.(db)
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
    await seedAdmin()
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
    const restored = createTestDatabaseFile()
    const adminId = await seedAdmin(restored.db)
    mockStartRestoreJob.mockImplementation(
      async (fn: () => Promise<void>, afterReopenFn?: (db: unknown) => Promise<void>) => {
        await fn()
        await afterReopenFn?.(restored.db)
      },
    )

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
    expect(mockRestoreFromStagedBackup).toHaveBeenCalledWith(
      expect.objectContaining({ dir: expect.any(String) }),
      'test.db.tar.gz',
      { withAnalytics: false },
    )
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'setup_restored',
        resourceType: 'backup',
        resourceId: 'test.db.tar.gz',
        actorId: adminId,
        actorRole: 'admin',
      }),
    )
  })

  it('still accepts when the swapped file yields no admin row — the audit event is skipped', async () => {
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
    expect(mockRecordAuditEvent).not.toHaveBeenCalled()
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

  it('rejects an encrypted upload without a password form field — and sweeps the staged dir (no parking here)', async () => {
    const stagedDir = mkdtempSync(join(tmpdir(), 'kobato-restore-'))
    mockStageBackup.mockRejectedValueOnce(await makePasswordRequiredError(stagedDir))
    const app = await buildApp(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' }))
    const formData = new FormData()
    formData.set('file', new File(['encrypted-bytes'], 'backup.db.tar.gz.enc'))

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe('该备份已加密，请同时提供备份密码。')
    expect(existsSync(stagedDir)).toBe(false)
  })

  it('passes the password form field through to staging', async () => {
    const app = await buildApp(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' }))
    const formData = new FormData()
    formData.set('file', new File(['encrypted-bytes'], 'backup.db.tar.gz.enc'))
    formData.set('password', 'open-sesame')

    const res = await app.request('/api/setup/restore', {
      method: 'POST',
      body: formData,
      headers: { 'x-csrf-token': 'valid-csrf' },
    })

    expect(res.status).toBe(200)
    expect(mockStageBackup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ password: 'open-sesame' }),
    )
  })
})
