import type { Database } from '@kobato/db/database'
import type { PutStreamInput, StorageBackend } from '@kobato/server/infra/storage/backend'

import { sqliteOf } from '@kobato/db/database'
import { auditLog } from '@kobato/db/schema/config'
import { user } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import {
  parkEncryptedUpload,
  peekEncryptedUpload,
  resetPendingEncryptedUploads,
} from '@kobato/server/domains/backup/pending-uploads'
import {
  resetRestoreMachine,
  startRestoreJob,
  tryBeginRestore,
  wireRestoreMachine,
} from '@kobato/server/domains/backup/restore-machine'
import { resetStagingProgress } from '@kobato/server/domains/backup/restore-progress'
import { createBackup } from '@kobato/server/domains/backup/services/backup'
import { adminBackupRouter } from '@kobato/server/http/controllers/admin/backup.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __setEnginePathsForTests } from '@kobato/server/infra/db/paths'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call, ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const backupModule = await import('@kobato/server/domains/backup/services/backup')
const restoreModule = await import('@kobato/server/domains/backup/services/restore')
const getBackupStream = vi.spyOn(backupModule, 'getBackupStream')
const stageBackup = vi.spyOn(restoreModule, 'stageBackup')
const restoreFromStagedBackup = vi.spyOn(restoreModule, 'restoreFromStagedBackup')
const assertStagedBackupContainsAdmin = vi
  .spyOn(restoreModule, 'assertStagedBackupContainsAdmin')
  .mockResolvedValue(undefined)

const db = getTestDb()

const s3Memory = makeMemoryBackend({ driver: 's3' })
const localMemory = makeMemoryBackend({ driver: 'local' })

let restoreDeps: {
  drain: Mock<() => Promise<void>>
  prepareForSwap: Mock<() => Promise<void>>
  reopenAfterSwap: Mock<() => Promise<Database>>
  complete: Mock<(success: boolean, error?: Error) => Promise<void>>
}

const engineDir = mkdtempSync(join(tmpdir(), 'kobato-admin-backup-'))
const enginePaths = { database: join(engineDir, 'kobato.db'), analytics: join(engineDir, 'analytics.duckdb') }

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
  initAllBatchers(getDatabaseHandle())
  __setStorageBackendForTests('s3', s3Memory.backend)
  __setStorageBackendForTests('local', localMemory.backend)
  __setEnginePathsForTests(enginePaths)
  writeFileSync(enginePaths.database, 'live-db')
  writeFileSync(enginePaths.analytics, 'live-analytics')
  getBackupStream.mockClear()
  stageBackup.mockClear()
  restoreFromStagedBackup.mockClear()
  assertStagedBackupContainsAdmin.mockClear()
  restoreDeps = {
    drain: vi.fn(async () => {}),
    prepareForSwap: vi.fn(async () => {}),
    reopenAfterSwap: vi.fn(async () => db),
    complete: vi.fn(async () => {}),
  }
  wireRestoreMachine(restoreDeps)
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
  resetRestoreMachine()
  resetPendingEncryptedUploads()
  resetStagingProgress()
  __resetStorageBackendsForTests()
  __setEnginePathsForTests(null)
  rmSync(engineDir, { recursive: true, force: true })
  mkdirSync(engineDir, { recursive: true })
  s3Memory.reset()
  localMemory.reset()
})

async function seedAdmin(): Promise<number> {
  const [row] = await sqliteOf(db)
    .insert(user)
    .values({ name: 'Admin', email: 'admin@example.com', password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

function adminCtx(userId: number) {
  return makeAuthedCtx({ userId: String(userId), role: 'admin', db })
}

async function createRealBackup(userId: number, password?: string) {
  const input = password === undefined ? undefined : { password }
  return call(adminBackupRouter.create, input, { context: adminCtx(userId) })
}

describe('adminBackupRouter.status', () => {
  it('returns the active primary driver', async () => {
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.status, undefined, { context: adminCtx(admin) })
    expect(res).toEqual({ primaryDriver: 's3' })
  })
})

describe('adminBackupRouter.list', () => {
  it('returns files array', async () => {
    await s3Memory.backend.put({
      key: 'backup/backup-2026-01-01T00-00-00.db.tar.gz',
      body: Buffer.alloc(1024),
      contentType: 'application/gzip',
      visibility: 'private',
    })
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.list, undefined, { context: adminCtx(admin) })
    expect(res.files).toHaveLength(1)
    expect(res.files[0].key).toBe('2026-01-01T00-00-00')
    expect(res.files[0].fileName).toBe('backup-2026-01-01T00-00-00.db.tar.gz')
    expect(res.files[0].size).toBe(1024)
    expect(res.nextContinuationToken).toBeUndefined()
  })
})

describe('adminBackupRouter.create', () => {
  it('creates a real archive in the backend and records a backup_created audit row', async () => {
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.create, undefined, { context: adminCtx(admin) })
    expect(res.fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[0-9a-f]{16}\.db\.tar\.gz$/)
    expect(res.size).toBeGreaterThan(0)
    expect(res.timestamp).toBe(res.fileName.replace(/^backup-/, '').replace(/\.db\.tar\.gz$/, ''))

    const stored = s3Memory.store.get(`backup/${res.fileName}`)
    expect(stored).toBeDefined()
    expect(stored!.body.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'backup_created'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('backup')
    expect(rows[0]!.resourceId).toBe(res.fileName)
    expect(rows[0]!.actorId).toBe(admin)
  })

  it('rejects a concurrent create with CONFLICT while another backup is in flight', async () => {
    let enteredPutStream!: () => void
    const putStreamEntered = new Promise<void>((resolve) => {
      enteredPutStream = resolve
    })
    let releaseUpload!: () => void
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve
    })
    const gated: StorageBackend = {
      ...s3Memory.backend,
      async putStream(input: PutStreamInput) {
        enteredPutStream()
        await uploadGate
        return s3Memory.backend.putStream(input)
      },
    }
    __setStorageBackendForTests('s3', gated)

    const admin = await seedAdmin()
    const ctx = adminCtx(admin)
    const first = call(adminBackupRouter.create, undefined, { context: ctx })
    await putStreamEntered

    const conflict = await call(adminBackupRouter.create, undefined, { context: ctx }).then(
      () => {
        throw new Error('second create unexpectedly succeeded')
      },
      (error: unknown) => error,
    )
    expect(conflict).toBeInstanceOf(ORPCError)
    expect((conflict as ORPCError<'CONFLICT', unknown>).code).toBe('CONFLICT')

    releaseUpload()
    const res = await first
    expect(s3Memory.store.has(`backup/${res.fileName}`)).toBe(true)

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'backup_created'))
    expect(rows).toHaveLength(1)
  })
  it('creates an encrypted .enc archive when a per-backup password override is given', async () => {
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.create, { password: 'one-off-password' }, { context: adminCtx(admin) })
    expect(res.fileName).toMatch(/\.db\.tar\.gz\.enc$/)

    const stored = s3Memory.store.get(`backup/${res.fileName}`)
    expect(stored).toBeDefined()
    expect(stored!.body.subarray(0, 8).toString('latin1')).toBe('KOBENC01')
  })
})

describe('adminBackupRouter.delete', () => {
  it('deletes the stored object and records a backup_deleted audit row', async () => {
    const created = await createBackup(db)
    const storageKey = `backup/${created.fileName}`
    expect(s3Memory.store.has(storageKey)).toBe(true)

    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.delete, { key: created.timestamp }, { context: adminCtx(admin) })
    expect(res).toEqual({ success: true })

    expect(s3Memory.deletedKeys).toEqual([storageKey])
    expect(s3Memory.store.has(storageKey)).toBe(false)

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'backup_deleted'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('backup')
    expect(rows[0]!.resourceId).toBe(created.timestamp)
    expect(rows[0]!.actorId).toBe(admin)
  })

  it('rejects invalid key formats', async () => {
    const admin = await seedAdmin()
    const ctx = adminCtx(admin)
    for (const badKey of ['../etc/passwd', 'backup/../../secret', 'backup/x.sql.gz', '', 'abc']) {
      await expect(call(adminBackupRouter.delete, { key: badKey }, { context: ctx })).rejects.toThrow(ORPCError)
    }
  })
})

describe('adminBackupRouter.restore', () => {
  it('returns accepted after restoring a real backup and runs the machine chain for real', async () => {
    const admin = await seedAdmin()
    const created = await createRealBackup(admin)
    const res = await call(adminBackupRouter.restore, { key: created.timestamp }, { context: adminCtx(admin) })
    expect(res).toEqual({ accepted: true })

    await vi.waitFor(() => expect(restoreDeps.complete).toHaveBeenCalledWith(true, undefined))
    expect(restoreDeps.drain).toHaveBeenCalledOnce()
    expect(restoreDeps.prepareForSwap).toHaveBeenCalledOnce()
    expect(restoreDeps.reopenAfterSwap).toHaveBeenCalledOnce()
    expect(
      readFileSync(enginePaths.database).equals(s3Memory.store.get(`backup/${created.fileName}`)!.body.subarray(0, 0)),
    ).toBe(false)

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'backup_restored'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('backup')
    expect(rows[0]!.resourceId).toBe(created.timestamp)
    expect(rows[0]!.actorId).toBe(admin)
  })

  it('rejects invalid key formats', async () => {
    const admin = await seedAdmin()
    const ctx = adminCtx(admin)
    for (const badKey of ['../etc/passwd', 'backup/../../secret', 'backup/x.sql.gz', '']) {
      await expect(call(adminBackupRouter.restore, { key: badKey }, { context: ctx })).rejects.toThrow(ORPCError)
    }
  })

  it('rejects concurrent restore requests', async () => {
    expect(tryBeginRestore()).toBe(true)
    const admin = await seedAdmin()
    await expect(
      call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: adminCtx(admin) }),
    ).rejects.toThrow(ORPCError)
  })

  it('asks for a password when the backup is encrypted and none is available — without claiming the slot', async () => {
    const admin = await seedAdmin()
    const created = await createRealBackup(admin, 'one-off-password')
    getBackupStream.mockClear()

    const res = await call(adminBackupRouter.restore, { key: created.timestamp }, { context: adminCtx(admin) })
    expect(res).toEqual({ passwordRequired: true })
    expect(getBackupStream).not.toHaveBeenCalled()
    expect(restoreDeps.drain).not.toHaveBeenCalled()
  })

  it('restores a real encrypted backup when the caller supplies the password', async () => {
    const admin = await seedAdmin()
    const created = await createRealBackup(admin, 'supplied-password')

    const res = await call(
      adminBackupRouter.restore,
      { key: created.timestamp, password: 'supplied-password' },
      {
        context: adminCtx(admin),
      },
    )
    expect(res).toEqual({ accepted: true })
    expect(stageBackup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ password: 'supplied-password' }),
    )
    await vi.waitFor(() => expect(restoreDeps.complete).toHaveBeenCalledWith(true, undefined))
  })

  it('propagates the real GCM failure when the caller-supplied password is wrong', async () => {
    const admin = await seedAdmin()
    const created = await createRealBackup(admin, 'right-password')

    await expect(
      call(
        adminBackupRouter.restore,
        { key: created.timestamp, password: 'wrong-password' },
        { context: adminCtx(admin) },
      ),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      status: 400,
      data: { descriptor: { messageKey: 'backup.error.passwordWrong' } },
    })
  })

  it('caps explicit-password restore attempts per (admin, backup) — the 11th guess is a 429', async () => {
    const admin = await seedAdmin()
    await createRealBackup(admin, 'right-password')
    const created = await createRealBackup(admin, 'right-password')

    for (let i = 0; i < 10; i++) {
      await expect(
        call(
          adminBackupRouter.restore,
          { key: created.timestamp, password: `guess-${i}` },
          { context: adminCtx(admin) },
        ),
      ).rejects.toThrow(ORPCError)
    }
    expect(getBackupStream).toHaveBeenCalledTimes(10)

    await expect(
      call(adminBackupRouter.restore, { key: created.timestamp, password: 'guess-11' }, { context: adminCtx(admin) }),
    ).rejects.toMatchObject({ status: 429 })
    expect(getBackupStream).toHaveBeenCalledTimes(10)
  })

  it('falls back to asking for a password when the STORED settings password fails to decrypt', async () => {
    const admin = await seedAdmin()
    await createRealBackup(admin, 'right-password')
    const created = await createRealBackup(admin, 'right-password')
    const { wireBackupEncryption, resetBackupEncryption } = backupModule
    wireBackupEncryption({ resolveEncryptionPassword: () => 'stored-password' })
    try {
      const res = await call(adminBackupRouter.restore, { key: created.timestamp }, { context: adminCtx(admin) })
      expect(res).toEqual({ passwordRequired: true })
      expect(stageBackup).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ password: 'stored-password' }),
      )
    } finally {
      resetBackupEncryption()
    }
  })

  it('asks for a password when the key says plain but the BYTES are encrypted — and sweeps the staged dir', async () => {
    const admin = await seedAdmin()
    const plain = await createRealBackup(admin)
    const enc = await createRealBackup(admin, 'one-off-password')
    const encBody = s3Memory.store.get(`backup/${enc.fileName}`)!.body
    await s3Memory.backend.put({
      key: `backup/${plain.fileName}`,
      body: encBody,
      contentType: 'application/gzip',
      visibility: 'private',
    })

    const res = await call(adminBackupRouter.restore, { key: plain.timestamp }, { context: adminCtx(admin) })
    expect(res).toEqual({ passwordRequired: true })
    expect(restoreDeps.drain).not.toHaveBeenCalled()
    expect(restoreDeps.complete).not.toHaveBeenCalled()
  })
})

function parkUploadedBackup(fileName = 'backup.db.tar.gz.enc'): { token: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-decrypt-'))
  writeFileSync(join(dir, 'upload.bin'), 'raw-encrypted-bytes')
  const token = parkEncryptedUpload({ dir, uploadPath: join(dir, 'upload.bin'), fileName })
  return { token, dir }
}

function destroyStageSource(source: unknown): void {
  if (source instanceof Readable) {
    source.on('error', () => {})
    source.destroy()
  }
}

describe('adminBackupRouter.uploadRestoreDecrypt', () => {
  it('rejects an empty token or password as 400 backup.error.passwordMissing', async () => {
    const admin = await seedAdmin()
    const ctx = adminCtx(admin)
    for (const input of [
      { token: '', password: 'some-password' },
      { token: 'some-token', password: '' },
    ]) {
      await expect(call(adminBackupRouter.uploadRestoreDecrypt, input, { context: ctx })).rejects.toMatchObject({
        status: 400,
        data: { descriptor: { messageKey: 'backup.error.passwordMissing' } },
      })
    }
  })

  it('rejects a password over 512 chars as 400 backup.error.passwordTooLong', async () => {
    const admin = await seedAdmin()
    await expect(
      call(
        adminBackupRouter.uploadRestoreDecrypt,
        { token: 'some-token', password: 'x'.repeat(513) },
        {
          context: adminCtx(admin),
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      data: { descriptor: { messageKey: 'backup.error.passwordTooLong' } },
    })
  })

  it('rejects an unknown token as 410 backup.error.uploadExpired', async () => {
    const admin = await seedAdmin()
    await expect(
      call(
        adminBackupRouter.uploadRestoreDecrypt,
        { token: 'no-such-token', password: 'whatever' },
        {
          context: adminCtx(admin),
        },
      ),
    ).rejects.toMatchObject({
      status: 410,
      data: { descriptor: { messageKey: 'backup.error.uploadExpired' } },
    })
  })

  it('rejects a token expired past the 10-minute TTL as 410', async () => {
    const admin = await seedAdmin()
    vi.useFakeTimers()
    const { token, dir } = parkUploadedBackup()
    try {
      vi.advanceTimersByTime(11 * 60 * 1000)
      await expect(
        call(
          adminBackupRouter.uploadRestoreDecrypt,
          { token, password: 'any-password' },
          {
            context: adminCtx(admin),
          },
        ),
      ).rejects.toMatchObject({ status: 410 })
    } finally {
      vi.useRealTimers()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects an in-flight token as 409 backup.error.decryptInProgress', async () => {
    const admin = await seedAdmin()
    const { token, dir } = parkUploadedBackup()
    try {
      peekEncryptedUpload(token)!.inFlight = true
      await expect(
        call(
          adminBackupRouter.uploadRestoreDecrypt,
          { token, password: 'any-password' },
          {
            context: adminCtx(admin),
          },
        ),
      ).rejects.toMatchObject({
        status: 409,
        data: { descriptor: { messageKey: 'backup.error.decryptInProgress' } },
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps the parked token on a wrong password (400 backup.error.passwordWrong)', async () => {
    const admin = await seedAdmin()
    const { token, dir } = parkUploadedBackup()
    try {
      stageBackup.mockImplementationOnce(async (source: unknown) => {
        destroyStageSource(source)
        throw new restoreModule.BackupPasswordError()
      })
      await expect(
        call(
          adminBackupRouter.uploadRestoreDecrypt,
          { token, password: 'wrong-password' },
          {
            context: adminCtx(admin),
          },
        ),
      ).rejects.toMatchObject({
        status: 400,
        data: { descriptor: { messageKey: 'backup.error.passwordWrong' } },
      })
      expect(peekEncryptedUpload(token)).not.toBeNull()
      expect(peekEncryptedUpload(token)!.inFlight).toBe(false)
      expect(restoreFromStagedBackup).not.toHaveBeenCalled()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('releases the token with 410 when staging fails for a NON-password reason', async () => {
    const admin = await seedAdmin()
    const { token, dir } = parkUploadedBackup()
    try {
      stageBackup.mockImplementationOnce(async (source: unknown) => {
        destroyStageSource(source)
        throw new ActionFailure(400, '备份归档中缺少内容数据库 kobato.db')
      })
      await expect(
        call(
          adminBackupRouter.uploadRestoreDecrypt,
          { token, password: 'any-password' },
          {
            context: adminCtx(admin),
          },
        ),
      ).rejects.toMatchObject({ status: 410, message: '备份归档中缺少内容数据库 kobato.db' })
      expect(peekEncryptedUpload(token)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('releases the token with 410 backup.error.invalidFileReupload when staging throws unexpectedly', async () => {
    const admin = await seedAdmin()
    const { token, dir } = parkUploadedBackup()
    try {
      stageBackup.mockImplementationOnce(async (source: unknown) => {
        destroyStageSource(source)
        throw new Error('disk exploded')
      })
      await expect(
        call(
          adminBackupRouter.uploadRestoreDecrypt,
          { token, password: 'any-password' },
          {
            context: adminCtx(admin),
          },
        ),
      ).rejects.toMatchObject({
        status: 410,
        data: { descriptor: { messageKey: 'backup.error.invalidFileReupload' } },
      })
      expect(peekEncryptedUpload(token)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('releases the token with 410 backup.error.invalidFileNoAdminReupload when the admin check fails — and sweeps the staged dir', async () => {
    const admin = await seedAdmin()
    const { token, dir } = parkUploadedBackup()
    const stagedDir = mkdtempSync(join(tmpdir(), 'kobato-staged-'))
    try {
      stageBackup.mockImplementationOnce(async (source: unknown) => {
        destroyStageSource(source)
        return { dir: stagedDir, content: join(stagedDir, 'kobato.db'), analytics: null, config: null }
      })
      assertStagedBackupContainsAdmin.mockRejectedValueOnce(new Error('file is not a database'))
      await expect(
        call(
          adminBackupRouter.uploadRestoreDecrypt,
          { token, password: 'any-password' },
          {
            context: adminCtx(admin),
          },
        ),
      ).rejects.toMatchObject({
        status: 410,
        data: { descriptor: { messageKey: 'backup.error.invalidFileNoAdminReupload' } },
      })
      expect(peekEncryptedUpload(token)).toBeNull()
      expect(existsSync(stagedDir)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(stagedDir, { recursive: true, force: true })
    }
  })

  it('keeps the parked token when staging wins but the restore slot is busy (409 restoreRunning)', async () => {
    const admin = await seedAdmin()
    const { token, dir } = parkUploadedBackup()
    const stagedDir = mkdtempSync(join(tmpdir(), 'kobato-staged-busy-'))
    try {
      stageBackup.mockImplementationOnce(async (source: unknown) => {
        destroyStageSource(source)
        return { dir: stagedDir, content: join(stagedDir, 'kobato.db'), analytics: null, config: null }
      })
      expect(tryBeginRestore()).toBe(true)
      await expect(
        call(
          adminBackupRouter.uploadRestoreDecrypt,
          { token, password: 'right-password' },
          {
            context: adminCtx(admin),
          },
        ),
      ).rejects.toMatchObject({
        status: 409,
        data: { descriptor: { messageKey: 'backup.error.restoreRunning' } },
      })
      const parked = peekEncryptedUpload(token)
      expect(parked).not.toBeNull()
      expect(parked!.inFlight).toBe(false)
      expect(existsSync(stagedDir)).toBe(false)
      expect(restoreFromStagedBackup).not.toHaveBeenCalled()
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(stagedDir, { recursive: true, force: true })
    }
  })

  it('completes the restore for a parked upload — releasing the token and auditing backup_restored under the parked file name', async () => {
    const admin = await seedAdmin()
    const { token, dir } = parkUploadedBackup('backup.db.tar.gz.enc')
    const stagedDir = mkdtempSync(join(tmpdir(), 'kobato-staged-ok-'))
    try {
      stageBackup.mockImplementationOnce(async (source: unknown) => {
        destroyStageSource(source)
        return { dir: stagedDir, content: join(stagedDir, 'kobato.db'), analytics: null, config: null }
      })
      restoreFromStagedBackup.mockResolvedValueOnce({ configApplied: true })

      const res = await call(
        adminBackupRouter.uploadRestoreDecrypt,
        { token, password: 'right-password' },
        {
          context: adminCtx(admin),
        },
      )
      expect(res).toEqual({ accepted: true })
      expect(peekEncryptedUpload(token)).toBeNull()
      expect(restoreFromStagedBackup).toHaveBeenCalledWith(
        expect.objectContaining({ dir: stagedDir }),
        'backup.db.tar.gz.enc',
        {},
      )
      await vi.waitFor(() => expect(restoreDeps.complete).toHaveBeenCalledWith(true, undefined))

      await flushAuditLog()
      const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'backup_restored'))
      expect(rows).toHaveLength(1)
      expect(rows[0].resourceType).toBe('backup')
      expect(rows[0].resourceId).toBe('backup.db.tar.gz.enc')
      expect(rows[0].actorId).toBe(admin)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(stagedDir, { recursive: true, force: true })
    }
  })

  it('rate limits decrypt attempts per IP BEFORE input parsing — malformed input burns the budget and the next well-formed call is a 429', async () => {
    const admin = await seedAdmin()
    const ctx = adminCtx(admin)
    for (let i = 0; i < 30; i++) {
      await expect(
        call(adminBackupRouter.uploadRestoreDecrypt, { token: `unknown-${i}` } as never, {
          context: ctx,
        }),
      ).rejects.toMatchObject({ status: 400 })
    }
    await expect(
      call(
        adminBackupRouter.uploadRestoreDecrypt,
        { token: 'well-formed', password: 'whatever' },
        {
          context: ctx,
        },
      ),
    ).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      status: 429,
      data: { descriptor: { messageKey: 'error.api.rateLimited' } },
    })
  })
})

describe('adminBackupRouter.restoreProgress', () => {
  it('reports the merged idle snapshot', async () => {
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.restoreProgress, undefined, { context: adminCtx(admin) })
    expect(res).toEqual({ stage: 'idle', percent: null })
  })
})

describe('adminBackupRouter.restoreStatus', () => {
  it('consumes the machine report once, then reports idle', async () => {
    const admin = await seedAdmin()
    expect(tryBeginRestore()).toBe(true)
    startRestoreJob(async () => ({ configApplied: true }))
    await vi.waitFor(() => expect(restoreDeps.complete).toHaveBeenCalledWith(true, undefined))

    const ctx = adminCtx(admin)
    await expect(call(adminBackupRouter.restoreStatus, undefined, { context: ctx })).resolves.toMatchObject({
      phase: 'completed',
      configApplied: true,
    })
    await expect(call(adminBackupRouter.restoreStatus, undefined, { context: ctx })).resolves.toEqual({
      phase: 'idle',
      startedAt: '',
    })
  })
})
