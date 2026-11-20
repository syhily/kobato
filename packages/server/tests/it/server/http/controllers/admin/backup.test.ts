import type { Database } from '@kobato/db/database.ts'
import type { PutStreamInput, StorageBackend } from '@kobato/server/infra/storage/backend.ts'

import { auditLog } from '@kobato/db/schema/config.ts'
import { user } from '@kobato/db/schema/user.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher.ts'
import {
  resetRestoreMachine,
  tryBeginRestore,
  wireRestoreMachine,
} from '@kobato/server/domains/backup/restore-machine.ts'
import { createBackup } from '@kobato/server/domains/backup/services/backup.ts'
import { adminBackupRouter } from '@kobato/server/http/controllers/admin/backup.controller.ts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit.ts'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage.ts'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx.ts'
import { call, ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@kobato/server/domains/backup/services/backup.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/domains/backup/services/backup.ts')>()
  return {
    ...actual,
    getBackupStream: vi.fn(),
    isBackupEncrypted: vi.fn(async () => false),
  }
})

vi.mock('@kobato/server/domains/backup/services/restore.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/domains/backup/services/restore.ts')>()
  return {
    ...actual,
    stageBackup: vi.fn(async () => ({ dir: '/tmp/staged', content: '/tmp/staged/kobato.db', analytics: null })),
    restoreFromStagedBackup: vi.fn(async () => undefined),
  }
})

const db = getTestDb()

const s3Memory = makeMemoryBackend({ driver: 's3' })
const localMemory = makeMemoryBackend({ driver: 'local' })

let restoreDeps: {
  drain: Mock<() => Promise<void>>
  prepareForSwap: Mock<() => Promise<void>>
  reopenAfterSwap: Mock<() => Promise<Database>>
  complete: Mock<(success: boolean, error?: Error) => Promise<void>>
}

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
  initAllBatchers(getDatabaseHandle())
  __setStorageBackendForTests('s3', s3Memory.backend)
  __setStorageBackendForTests('local', localMemory.backend)
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
  __resetStorageBackendsForTests()
  s3Memory.reset()
  localMemory.reset()
})

async function seedAdmin(): Promise<number> {
  const [row] = await db
    .insert(user)
    .values({ name: 'Admin', email: 'admin@example.com', password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

function adminCtx(userId: number) {
  return makeAuthedCtx({ userId: String(userId), role: 'admin', db })
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
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'backup_created'))
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
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'backup_created'))
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
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'backup_deleted'))
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
  it('returns accepted after restoring backup and runs the machine chain for real', async () => {
    const backupService = await import('@kobato/server/domains/backup/services/backup.ts')
    vi.mocked(backupService.getBackupStream).mockResolvedValueOnce({
      stream: Readable.from(['archive-bytes']),
      byteSize: 13,
      encrypted: false,
      fileName: 'backup-2026-01-01T00-00-00.db.tar.gz',
    })
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: adminCtx(admin) })
    expect(res).toEqual({ accepted: true })

    await vi.waitFor(() => expect(restoreDeps.complete).toHaveBeenCalledWith(true, undefined))
    expect(restoreDeps.drain).toHaveBeenCalledOnce()
    expect(restoreDeps.prepareForSwap).toHaveBeenCalledOnce()
    expect(restoreDeps.reopenAfterSwap).toHaveBeenCalledOnce()

    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'backup_restored'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('backup')
    expect(rows[0]!.resourceId).toBe('2026-01-01T00-00-00')
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
    const backupService = await import('@kobato/server/domains/backup/services/backup.ts')
    vi.mocked(backupService.isBackupEncrypted).mockResolvedValueOnce(true)
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: adminCtx(admin) })
    expect(res).toEqual({ passwordRequired: true })
    expect(vi.mocked(backupService.getBackupStream)).not.toHaveBeenCalled()
    expect(restoreDeps.drain).not.toHaveBeenCalled()
  })

  it('restores an encrypted backup when the caller supplies the password', async () => {
    const backupService = await import('@kobato/server/domains/backup/services/backup.ts')
    const restoreService = await import('@kobato/server/domains/backup/services/restore.ts')
    vi.mocked(backupService.isBackupEncrypted).mockResolvedValueOnce(true)
    vi.mocked(backupService.getBackupStream).mockResolvedValueOnce({
      stream: Readable.from(['archive-bytes']),
      byteSize: 13,
      encrypted: true,
      fileName: 'backup-2026-01-01T00-00-00.db.tar.gz.enc',
    })
    const admin = await seedAdmin()
    const res = await call(
      adminBackupRouter.restore,
      { key: '2026-01-01T00-00-00', password: 'supplied-password' },
      { context: adminCtx(admin) },
    )
    expect(res).toEqual({ accepted: true })
    expect(vi.mocked(restoreService.stageBackup)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ password: 'supplied-password' }),
    )
    await vi.waitFor(() => expect(restoreDeps.complete).toHaveBeenCalledWith(true, undefined))
  })

  it('propagates the staging failure when the caller-supplied password is wrong', async () => {
    const backupService = await import('@kobato/server/domains/backup/services/backup.ts')
    const restoreService = await import('@kobato/server/domains/backup/services/restore.ts')
    vi.mocked(backupService.isBackupEncrypted).mockResolvedValueOnce(true)
    vi.mocked(backupService.getBackupStream).mockResolvedValueOnce({
      stream: Readable.from(['archive-bytes']),
      byteSize: 13,
      encrypted: true,
      fileName: 'backup-2026-01-01T00-00-00.db.tar.gz.enc',
    })
    vi.mocked(restoreService.stageBackup).mockRejectedValueOnce(new restoreService.BackupPasswordError())
    const admin = await seedAdmin()
    await expect(
      call(
        adminBackupRouter.restore,
        { key: '2026-01-01T00-00-00', password: 'wrong-password' },
        { context: adminCtx(admin) },
      ),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      status: 400,
      data: { descriptor: { messageKey: 'backup.error.passwordWrong' } },
    })
  })

  it('caps explicit-password restore attempts per (admin, backup) — the 11th guess is a 429', async () => {
    const backupService = await import('@kobato/server/domains/backup/services/backup.ts')
    const restoreService = await import('@kobato/server/domains/backup/services/restore.ts')
    vi.mocked(backupService.isBackupEncrypted).mockResolvedValue(true)
    vi.mocked(backupService.getBackupStream).mockResolvedValue({
      stream: Readable.from(['archive-bytes']),
      byteSize: 13,
      encrypted: true,
      fileName: 'backup-2026-03-03T00-00-00.db.tar.gz.enc',
    })
    // Every guess fails the GCM tag check.
    vi.mocked(restoreService.stageBackup).mockRejectedValue(new restoreService.BackupPasswordError())
    const admin = await seedAdmin()

    for (let i = 0; i < 10; i++) {
      await expect(
        call(
          adminBackupRouter.restore,
          { key: '2026-03-03T00-00-00', password: `guess-${i}` },
          { context: adminCtx(admin) },
        ),
      ).rejects.toThrow(ORPCError)
    }
    expect(vi.mocked(backupService.getBackupStream)).toHaveBeenCalledTimes(10)

    await expect(
      call(
        adminBackupRouter.restore,
        { key: '2026-03-03T00-00-00', password: 'guess-11' },
        { context: adminCtx(admin) },
      ),
    ).rejects.toMatchObject({ status: 429 })
    expect(vi.mocked(backupService.getBackupStream)).toHaveBeenCalledTimes(10)
  })

  it('falls back to asking for a password when the STORED settings password fails to decrypt', async () => {
    const backupService = await import('@kobato/server/domains/backup/services/backup.ts')
    const restoreService = await import('@kobato/server/domains/backup/services/restore.ts')
    vi.mocked(backupService.isBackupEncrypted).mockResolvedValueOnce(true)
    vi.mocked(backupService.getBackupStream).mockResolvedValueOnce({
      stream: Readable.from(['archive-bytes']),
      byteSize: 13,
      encrypted: true,
      fileName: 'backup-2026-01-01T00-00-00.db.tar.gz.enc',
    })
    vi.mocked(restoreService.stageBackup).mockRejectedValueOnce(new restoreService.BackupPasswordError())
    const { wireBackupEncryption, resetBackupEncryption } = backupService
    wireBackupEncryption({ resolveEncryptionPassword: () => 'stored-password' })
    try {
      const admin = await seedAdmin()
      const res = await call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: adminCtx(admin) })
      expect(res).toEqual({ passwordRequired: true })
      expect(vi.mocked(restoreService.stageBackup)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ password: 'stored-password' }),
      )
    } finally {
      resetBackupEncryption()
    }
  })

  it('asks for a password when the row says plain but the BYTES are encrypted — and sweeps the staged dir', async () => {
    const backupService = await import('@kobato/server/domains/backup/services/backup.ts')
    const restoreService = await import('@kobato/server/domains/backup/services/restore.ts')
    vi.mocked(backupService.getBackupStream).mockResolvedValueOnce({
      stream: Readable.from(['archive-bytes']),
      byteSize: 13,
      encrypted: false,
      fileName: 'backup-2026-01-01T00-00-00.db.tar.gz',
    })
    const stagedDir = '/tmp/kobato-restore-mismatch'
    const required = new restoreService.EncryptedBackupPasswordRequired(stagedDir, `${stagedDir}/upload.bin`)
    vi.mocked(restoreService.stageBackup).mockRejectedValueOnce(required)
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: adminCtx(admin) })
    expect(res).toEqual({ passwordRequired: true })
    expect(restoreDeps.drain).not.toHaveBeenCalled()
    expect(restoreDeps.complete).not.toHaveBeenCalled()
  })
})
