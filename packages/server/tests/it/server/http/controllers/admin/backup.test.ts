import type { Database } from '@kobato/db/database'
import type { PutStreamInput, StorageBackend } from '@kobato/server/infra/storage/backend'

import { auditLog } from '@kobato/db/schema/config'
import { user } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { resetRestoreMachine, tryBeginRestore, wireRestoreMachine } from '@kobato/server/domains/backup/restore-machine'
import { createBackup } from '@kobato/server/domains/backup/services/backup'
import { adminBackupRouter } from '@kobato/server/http/controllers/admin/backup.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __setEnginePathsForTests } from '@kobato/server/infra/db/paths'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call, ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// Restore flows run against real archives created through the create
// endpoint; the two spies keep argument/short-circuit observability.
const backupModule = await import('@kobato/server/domains/backup/services/backup')
const restoreModule = await import('@kobato/server/domains/backup/services/restore')
const getBackupStream = vi.spyOn(backupModule, 'getBackupStream')
const stageBackup = vi.spyOn(restoreModule, 'stageBackup')

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
  __setEnginePathsForTests(null)
  rmSync(engineDir, { recursive: true, force: true })
  mkdirSync(engineDir, { recursive: true })
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
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'backup_restored'))
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
    // Corrupt the plain backup in place: its registry row stays plain while
    // the stored bytes are swapped for the encrypted archive.
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
