import type { Database } from '@kobato/db/sqlite/database'
import type { BlogSessionData } from '@kobato/server/domains/auth/session-storage'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { databaseOf, sqliteOf } from '@kobato/db/sqlite/database'
import { user as userTable } from '@kobato/db/sqlite/schema/user'
import { setupRouter } from '@kobato/server/http/controllers/account/setup.controller'
import { adminBackupRouter } from '@kobato/server/http/controllers/admin/backup.controller'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { clearAllTables, createTestDatabaseFile, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeAuthedCtx, makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSession } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockIsSetupTokenActive = vi.fn()
const mockRestoreFromStagedBackup = vi.fn()
const mockAssertStagedBackupContainsAdmin = vi.fn()
const mockStageBackup = vi.fn()
const mockStartRestoreJob = vi.fn()
const mockWithRestoreClaim = vi.fn()
const mockRecordAuditEvent = vi.fn()

vi.mock('@kobato/server/domains/auth/setup-token', () => ({
  isSetupTokenActive: (...args: unknown[]) => mockIsSetupTokenActive(...args),
}))

vi.mock('@kobato/server/domains/backup/services/restore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/domains/backup/services/restore')>()
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

vi.mock('@kobato/server/domains/backup/restore-machine', () => ({
  startRestoreJob: (...args: unknown[]) => mockStartRestoreJob(...args),
  withRestoreClaim: (...args: unknown[]) => mockWithRestoreClaim(...args),
  wireRestoreMachine: () => undefined,
  peekRestoreJobPhase: () => ({ phase: 'idle', error: null }),
  consumeRestoreJobReport: () => ({ phase: 'idle', error: null }),
}))

vi.mock('@kobato/server/domains/audit/services/record', () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
  recordAuditEventFromContext: vi.fn(),
}))

const db = getTestDb()

function makeSession(data: Partial<BlogSessionData> = {}) {
  return createSession<BlogSessionData, BlogSessionData>(data, 'test-session')
}

function setupContext(session: ReturnType<typeof makeSession>): HandlerContext {
  return { ...makePublicCtx({ db }), session }
}

function adminContext(): HandlerContext {
  return makeAuthedCtx({ db })
}

async function seedAdmin(target: Database = db): Promise<number> {
  const rows = await sqliteOf(target)
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

async function makePasswordRequiredError(dir: string): Promise<Error> {
  const restoreModule = await import('@kobato/server/domains/backup/services/restore')
  const uploadPath = join(dir, 'upload.bin')
  writeFileSync(uploadPath, 'raw-encrypted-bytes')
  return new restoreModule.EncryptedBackupPasswordRequired(dir, uploadPath)
}

beforeEach(async () => {
  vi.clearAllMocks()
  await clearAllTables(db)
  __resetRateLimitsForTests()
  mockIsSetupTokenActive.mockResolvedValue(true)
  mockAssertStagedBackupContainsAdmin.mockResolvedValue(undefined)
  mockRestoreFromStagedBackup.mockResolvedValue({ configApplied: false })
  mockStageBackup.mockResolvedValue({ dir: '/tmp/fake-staged', content: '/tmp/fake-staged/kobato.db', analytics: null })
  mockWithRestoreClaim.mockImplementation(async (prepare) => {
    const job = await prepare()
    if (job === null) {
      return 'declined'
    }
    await mockStartRestoreJob(job.restoreFn, job.afterReopenFn)
    return 'started'
  })
  mockStartRestoreJob.mockImplementation(async (fn, afterReopenFn) => {
    await fn()
    await afterReopenFn?.(db)
  })
})

describe('admin.backup.uploadRestore', () => {
  it('returns 400 and never claims the slot when the staged backup fails the content check', async () => {
    mockAssertStagedBackupContainsAdmin.mockRejectedValueOnce(new Error('file is not a database'))
    await expect(
      call(adminBackupRouter.uploadRestore, { file: new File(['content'], 'test.db') }, { context: adminContext() }),
    ).rejects.toMatchObject({ status: 400, data: { descriptor: { messageKey: 'backup.error.invalidFileNoAdmin' } } })
    expect(mockWithRestoreClaim).not.toHaveBeenCalled()
    expect(mockStartRestoreJob).not.toHaveBeenCalled()
  })

  it('skips the content check for analytics-only uploads', async () => {
    mockStageBackup.mockResolvedValue({ dir: '/tmp/fake-staged', content: null, analytics: '/tmp/a.duckdb' })
    const result = await call(
      adminBackupRouter.uploadRestore,
      { file: new File(['content'], 'analytics.duckdb') },
      { context: adminContext() },
    )
    expect(result).toEqual({ accepted: true })
    expect(mockAssertStagedBackupContainsAdmin).not.toHaveBeenCalled()
  })

  it('returns 409 when a restore is already running', async () => {
    mockWithRestoreClaim.mockResolvedValueOnce('busy')
    await expect(
      call(adminBackupRouter.uploadRestore, { file: new File(['content'], 'test.sql') }, { context: adminContext() }),
    ).rejects.toMatchObject({ status: 409, data: { descriptor: { messageKey: 'backup.error.restoreRunning' } } })
  })

  it('parks an encrypted upload and never claims the restore slot', async () => {
    const parkedDir = mkdtempSync(join(tmpdir(), 'kobato-restore-'))
    mockStageBackup.mockRejectedValueOnce(await makePasswordRequiredError(parkedDir))
    const result = await call(
      adminBackupRouter.uploadRestore,
      { file: new File(['encrypted-bytes'], 'backup.db.tar.gz.enc') },
      { context: adminContext() },
    )
    expect(result).toMatchObject({ encrypted: true })
    expect(mockWithRestoreClaim).not.toHaveBeenCalled()

    const { peekEncryptedUpload, resetPendingEncryptedUploads } =
      await import('@kobato/server/domains/backup/pending-uploads')
    try {
      if ('token' in result) {
        expect(peekEncryptedUpload(result.token)).not.toBeNull()
      }
    } finally {
      resetPendingEncryptedUploads()
      rmSync(parkedDir, { recursive: true, force: true })
    }
  })
})

describe('account.setup.restore', () => {
  it('returns 403 when session is not verified', async () => {
    await expect(
      call(setupRouter.restore, { file: new File(['content'], 'test.sql') }, { context: setupContext(makeSession()) }),
    ).rejects.toMatchObject({ status: 403, data: { descriptor: { messageKey: 'backup.error.setupTokenIncomplete' } } })
  })

  it('returns 403 when setup token has expired', async () => {
    mockIsSetupTokenActive.mockResolvedValue(false)
    await expect(
      call(
        setupRouter.restore,
        { file: new File(['content'], 'test.sql') },
        { context: setupContext(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' })) },
      ),
    ).rejects.toMatchObject({ status: 403, data: { descriptor: { messageKey: 'auth.setup.error.tokenExpired' } } })
  })

  it('returns 409 when admin already exists', async () => {
    await seedAdmin()
    await expect(
      call(
        setupRouter.restore,
        { file: new File(['content'], 'test.sql') },
        { context: setupContext(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' })) },
      ),
    ).rejects.toMatchObject({ status: 409, data: { descriptor: { messageKey: 'backup.error.siteInstalled' } } })
  })

  it('accepts restore and applies content only', async () => {
    const restored = createTestDatabaseFile()
    const adminId = await seedAdmin(databaseOf(restored))
    mockStartRestoreJob.mockImplementation(async (fn, afterReopenFn) => {
      await fn()
      await afterReopenFn?.(databaseOf(restored))
    })
    const result = await call(
      setupRouter.restore,
      { file: new File(['content'], 'test.db.tar.gz') },
      { context: setupContext(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' })) },
    )
    expect(result).toEqual({ accepted: true })
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

  it('skips the audit when the swapped file has no admin row', async () => {
    const result = await call(
      setupRouter.restore,
      { file: new File(['content'], 'test.db.tar.gz') },
      { context: setupContext(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' })) },
    )
    expect(result).toEqual({ accepted: true })
    expect(mockRecordAuditEvent).not.toHaveBeenCalled()
  })

  it('returns 409 when a restore is already running', async () => {
    mockWithRestoreClaim.mockResolvedValueOnce('busy')
    await expect(
      call(
        setupRouter.restore,
        { file: new File(['content'], 'test.sql') },
        { context: setupContext(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' })) },
      ),
    ).rejects.toMatchObject({ status: 409, data: { descriptor: { messageKey: 'backup.error.restoreRunning' } } })
  })

  it('rejects encrypted upload without password and sweeps the staged dir', async () => {
    const stagedDir = mkdtempSync(join(tmpdir(), 'kobato-restore-'))
    mockStageBackup.mockRejectedValueOnce(await makePasswordRequiredError(stagedDir))
    await expect(
      call(
        setupRouter.restore,
        { file: new File(['encrypted-bytes'], 'backup.db.tar.gz.enc') },
        { context: setupContext(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' })) },
      ),
    ).rejects.toMatchObject({ status: 400, data: { descriptor: { messageKey: 'backup.error.passwordMissingUpload' } } })
    expect(existsSync(stagedDir)).toBe(false)
  })

  it('passes the password through to staging', async () => {
    const result = await call(
      setupRouter.restore,
      { file: new File(['encrypted-bytes'], 'backup.db.tar.gz.enc'), password: 'open-sesame' },
      { context: setupContext(makeSession({ setupTokenVerified: true, csrfToken: 'valid-csrf' })) },
    )
    expect(result).toEqual({ accepted: true })
    expect(mockStageBackup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ password: 'open-sesame' }),
    )
  })
})
