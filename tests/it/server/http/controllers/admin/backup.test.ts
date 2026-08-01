import { call, ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { resetRestoreMachine, tryBeginRestore, wireRestoreMachine } from '@/server/domains/backup/restore-machine'
import { createBackup } from '@/server/domains/backup/services/backup'
import { adminBackupRouter } from '@/server/http/controllers/admin/backup.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { user } from '@/server/infra/db/schema/user'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// createBackup / listBackups / deleteBackup run for REAL against the test
// DB and an in-memory storage backend injected through the registry seam
// (see beforeEach) — no S3, no settings. Only the file-exchange boundary
// stays mocked: `getBackupStream` hands the restore route a synthetic
// archive stream, and `stageBackup`/`restoreFromStagedBackup` would do
// real file staging and a real database swap. The restore MACHINE (claim
// choreography, chain ordering, slot lifecycle) runs for real against
// injected deps below.
vi.mock('@/server/domains/backup/services/backup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/backup/services/backup')>()
  return {
    ...actual,
    getBackupStream: vi.fn(),
  }
})

vi.mock('@/server/domains/backup/services/restore', () => ({
  stageBackup: vi.fn(async () => ({ dir: '/tmp/staged', content: '/tmp/staged/kobato.db', analytics: null })),
  restoreFromStagedBackup: vi.fn(async () => undefined),
}))

// db-lifecycle wires the restore machine with real deps at import; those
// deps reach the process/restart boundary. Keep that boundary inert — the
// machine is re-wired with test deps in beforeEach anyway.
vi.mock('@/server/infra/lifecycle', () => ({
  requestShutdown: vi.fn(),
  registerShutdownHook: vi.fn(),
  unregisterShutdownHook: vi.fn(),
  setServerPhase: vi.fn(),
  restartServer: vi.fn(),
  setRestartDb: vi.fn(),
  setRestartRefreshSettings: vi.fn(),
}))

const db = getTestDb()

// Both driver slots route at in-memory backends. The 's3' one reports
// isAvailable() = true, so the real registry resolves it as the ACTIVE
// backend for new uploads; 'local' is swapped too so `listBackups`'s
// cross-backend reconcile never walks the real local storage directory.
const s3Memory = makeMemoryBackend({ driver: 's3' })
const localMemory = makeMemoryBackend({ driver: 'local' })

// The engine specifics (drain/close/reopen/complete) are injected deps of
// the real machine; the it environment has no HTTP server to drain and no
// file swap to reopen, so the deps are spies — the claim/abort/slot
// choreography under test is the machine's own, and it runs for real.
let restoreDeps: {
  drain: Mock<() => Promise<void>>
  prepareForSwap: Mock<() => Promise<void>>
  reopenAfterSwap: Mock<() => Promise<Database>>
  complete: Mock<(success: boolean, error?: Error) => Promise<void>>
}

beforeEach(async () => {
  await clearAllTables(db)
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

// audit_log.actor_id references user.id, so the admin actor must be a real
// row for the batched audit insert to survive the FK.
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
    // The injected in-memory 's3' backend is available, so the real
    // registry resolves it as the primary driver — no settings needed.
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.status, undefined, { context: adminCtx(admin) })
    expect(res).toEqual({ primaryDriver: 's3' })
  })
})

describe('adminBackupRouter.list', () => {
  it('returns files array', async () => {
    // Seed an object with no DB row: the real listBackups' reconcile
    // registers it, then lists it from the real query.
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
    expect(res.fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db\.tar\.gz$/)
    expect(res.size).toBeGreaterThan(0)
    expect(res.timestamp).toBe(res.fileName.replace(/^backup-/, '').replace(/\.db\.tar\.gz$/, ''))

    // The real createBackup streamed a gzipped archive into the backend.
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
})

describe('adminBackupRouter.delete', () => {
  it('deletes the stored object and records a backup_deleted audit row', async () => {
    // Seed a real backup (DB row + stored object) through the real service.
    const created = await createBackup(db)
    const storageKey = `backup/${created.fileName}`
    expect(s3Memory.store.has(storageKey)).toBe(true)

    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.delete, { key: created.timestamp }, { context: adminCtx(admin) })
    expect(res).toEqual({ success: true })

    // State assertion: the object went through the backend and is gone.
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
    const backupService = await import('@/server/domains/backup/services/backup')
    vi.mocked(backupService.getBackupStream).mockResolvedValueOnce({
      stream: Readable.from(['archive-bytes']),
      byteSize: 13,
    })
    const admin = await seedAdmin()
    const res = await call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: adminCtx(admin) })
    expect(res).toEqual({ accepted: true })

    // The real machine runs drain → prepareForSwap → restoreFn →
    // reopenAfterSwap → afterReopenFn → complete fire-and-forget; wait for
    // the chain to reach completion before asserting the ordering side
    // effects.
    await vi.waitFor(() => expect(restoreDeps.complete).toHaveBeenCalledWith(true, undefined))
    expect(restoreDeps.drain).toHaveBeenCalledOnce()
    expect(restoreDeps.prepareForSwap).toHaveBeenCalledOnce()
    expect(restoreDeps.reopenAfterSwap).toHaveBeenCalledOnce()

    // afterReopenFn records the restore audit event into the batcher.
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
    // Occupy the slot for real: a claimed-but-running restore makes the
    // machine's next claim return 'busy', which the route maps to 409.
    expect(tryBeginRestore()).toBe(true)
    const admin = await seedAdmin()
    await expect(
      call(adminBackupRouter.restore, { key: '2026-01-01T00-00-00' }, { context: adminCtx(admin) }),
    ).rejects.toThrow(ORPCError)
  })
})
