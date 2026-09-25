import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { clearAllTables, createTestDatabaseFile, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
  snapshotAnalyticsTo,
} from '@/server/bootstrap/analytics-lifecycle'

let analyticsHandle: AnalyticsHandle

import { extractBackupFile, unpackBackupPayload } from '#/_helpers/backup-buffer'
import { createBackup, getBackupBuffer, wireBackupSnapshots } from '@/server/domains/backup/services/backup'
import { findBackupByTimestamp } from '@/server/infra/db/operations/backup'
import { category } from '@/server/infra/db/schema/taxonomy'
import { ActionFailure } from '@/server/infra/http/errors'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// In-memory backend injected as 's3' (the active backend) — no real S3 or settings.
const mem = makeMemoryBackend()

const db = getTestDb()

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  analyticsHandle = await createTestAnalyticsDb()
  // The real snapshotAnalyticsTo, wired by injection to the adopted handle.
  __resetAnalyticsEngineForTests()
  __adoptAnalyticsHandleForTests(analyticsHandle)
  wireBackupSnapshots({ snapshotAnalyticsTo })
  await clearAllTables(db)
})

afterEach(() => {
  __resetStorageBackendsForTests()
  mem.reset()
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

describe('backup and restore integration', () => {
  it('creates a two-file tar.gz archive (content + analytics) that round-trips through the storage backend', async () => {
    await db
      .insert(category)
      .values({ name: 'BackupCat', slug: 'backup-cat', cover: '', description: '', sortOrder: 0 })
      .run()
    await seedAccessEvents(analyticsHandle, [
      { ts: new Date(), path: '/one', visitorHash: 'v1' },
      { ts: new Date(), path: '/two', visitorHash: 'v2' },
    ])

    const { fileName, size, timestamp } = await createBackup(db)

    expect(fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[0-9a-f]{16}\.db\.tar\.gz$/)
    expect(size).toBeGreaterThan(0)

    const key = `backup/${fileName}`
    const buffer = mem.store.get(key)?.body
    expect(buffer).toBeDefined()
    expect(buffer!.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))

    // Decompressed payload is a tar archive with both engine files, each magic-valid.
    const payload = unpackBackupPayload(extractBackupFile(buffer!))
    expect(payload.content!.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0')
    expect(payload.analytics).not.toBeNull()
    expect(payload.analytics!.subarray(8, 12).toString('latin1')).toBe('DUCK')

    const downloaded = await getBackupBuffer(db, timestamp)
    expect(downloaded.equals(buffer!)).toBe(true)

    // Seeded category survives in the archive; the restore DB is written to a NEW path.
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { openDatabase, closeDatabase } = await import('@/server/infra/db/database')
    const dir = mkdtempSync(join(tmpdir(), 'kobato-restore-it-'))
    const restored = openDatabase(join(dir, 'restored.db'))
    try {
      writeFileSync(restored.path, payload.content!)
      const rows = restored.db.select().from(category).where(eq(category.slug, 'backup-cat')).all()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.name).toBe('BackupCat')
    } finally {
      closeDatabase(restored)
    }

    const { openAnalyticsDatabase, closeAnalyticsDatabase } = await import('@/server/infra/analytics/duckdb')
    const { ACCESS_EVENTS_DDL } = await import('@/server/domains/analytics/services/access-log')
    writeFileSync(join(dir, 'restored.duckdb'), payload.analytics!)
    const restoredAnalytics = await openAnalyticsDatabase(join(dir, 'restored.duckdb'), ACCESS_EVENTS_DDL)
    try {
      const result = await restoredAnalytics.reader.runAndReadAll('SELECT count(*) AS c FROM access_events')
      expect(Number(result.getRowObjects()[0]?.c)).toBe(2)
    } finally {
      await closeAnalyticsDatabase(restoredAnalytics)
    }

    // The staged (streaming) restore path extracts the same archive without holding it in memory.
    const { stageBackup } = await import('@/server/domains/backup/services/restore')
    const staged = await stageBackup(buffer!)
    const { rmSync } = await import('node:fs')
    try {
      expect(staged.content).not.toBeNull()
      expect(staged.analytics).not.toBeNull()
      const stagedDb = openDatabase(join(dir, 'staged-copy.db'))
      try {
        const { copyFileSync } = await import('node:fs')
        copyFileSync(staged.content!, stagedDb.path)
        const rows = stagedDb.db.select().from(category).where(eq(category.slug, 'backup-cat')).all()
        expect(rows).toHaveLength(1)
      } finally {
        closeDatabase(stagedDb)
      }
    } finally {
      rmSync(staged.dir, { recursive: true, force: true })
    }
  })

  it('records the exact stored byte count and a complete gzip header (stream-pipeline regression)', async () => {
    // Regression: a gzip 'data' byte counter forced flowing mode and lost
    // the first chunk before the drain attached. The 20ms below is
    // WALL-CLOCK on purpose — must not become a fake timer.
    __setStorageBackendForTests('s3', {
      ...mem.backend,
      async putStream(input) {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return mem.backend.putStream(input)
      },
    })

    const { size, timestamp } = await createBackup(db)

    const row = await findBackupByTimestamp(db, timestamp)
    expect(row).not.toBeNull()

    const stored = await getBackupBuffer(db, timestamp)
    // Gzip magic intact from byte zero — not a truncation.
    expect(stored.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))
    expect(row!.byteSize).toBe(stored.length)
    expect(size).toBe(stored.length)
  })

  it('rejects a payload that is not a SQLite database', () => {
    expect(() => unpackBackupPayload(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toThrow(ActionFailure)
    expect(() => unpackBackupPayload(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toThrow('SQLite')
  })

  it('rejects an oversize payload', () => {
    const big = Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(501 * 1024 * 1024, 0)])
    expect(() => unpackBackupPayload(big)).toThrow(ActionFailure)
  })

  it('passes a legacy raw (ungzipped) SQLite file through as content-only', async () => {
    // createTestDatabaseFile self-cleans through the harness registry.
    const fresh = createTestDatabaseFile()
    const { readFileSync } = await import('node:fs')
    const bytes: Buffer = readFileSync(fresh.path)
    const payload = unpackBackupPayload(extractBackupFile(bytes))
    expect(payload.content!.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0')
    expect(payload.analytics).toBeNull()
  })
})

describe('encrypted backups', () => {
  it('creates a .enc archive that round-trips through stageBackup with the password', async () => {
    const { createBackup, isBackupEncrypted, listBackups } = await import('@/server/domains/backup/services/backup')
    const { isEncryptedBackup } = await import('@/server/domains/backup/services/crypto')
    const { EncryptedBackupPasswordRequired, stageBackup } = await import('@/server/domains/backup/services/restore')
    const { readFileSync, rmSync } = await import('node:fs')

    const { fileName, timestamp } = await createBackup(db, null, { passwordOverride: 'correct horse battery staple' })

    // The key carries the .enc suffix and the payload the encryption magic.
    expect(fileName).toMatch(/\.db\.tar\.gz\.enc$/)
    const buffer = mem.store.get(`backup/${fileName}`)?.body
    expect(buffer).toBeDefined()
    expect(isEncryptedBackup(buffer!.subarray(0, 8))).toBe(true)

    // Row-level probes the restore controller and the list DTO rely on.
    expect(await isBackupEncrypted(db, timestamp)).toBe(true)
    const { files } = await listBackups(db)
    expect(files.find((file) => file.key === timestamp)?.encrypted).toBe(true)

    // No password: the staging error keeps the temp dir for the parked-upload flow.
    const noPassword: unknown = await stageBackup(buffer!).catch((caught: unknown) => caught)
    expect(noPassword).toBeInstanceOf(EncryptedBackupPasswordRequired)
    rmSync((noPassword as InstanceType<typeof EncryptedBackupPasswordRequired>).dir, {
      recursive: true,
      force: true,
    })

    // A wrong password fails the first GCM tag check — surfaced as a 400.
    await expect(stageBackup(buffer!, { password: 'wrong-password' })).rejects.toThrow(ActionFailure)

    // The right password stages exactly like the plaintext round-trip.
    const staged = await stageBackup(buffer!, { password: 'correct horse battery staple' })
    try {
      expect(staged.content).not.toBeNull()
      expect(staged.analytics).not.toBeNull()
      expect(readFileSync(staged.content!).subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0')
      expect(readFileSync(staged.analytics!).subarray(8, 12).toString('latin1')).toBe('DUCK')
    } finally {
      rmSync(staged.dir, { recursive: true, force: true })
    }
  })

  it('encrypts with the wired settings password when no per-run override is given', async () => {
    const { wireBackupEncryption, resetBackupEncryption } = await import('@/server/domains/backup/services/backup')
    const { stageBackup } = await import('@/server/domains/backup/services/restore')
    const { rmSync } = await import('node:fs')

    wireBackupEncryption({ resolveEncryptionPassword: () => 'settings-password' })
    try {
      const { fileName } = await createBackup(db)
      expect(fileName).toMatch(/\.enc$/)
      const buffer = mem.store.get(`backup/${fileName}`)?.body
      expect(buffer).toBeDefined()
      const staged = await stageBackup(buffer!, { password: 'settings-password' })
      rmSync(staged.dir, { recursive: true, force: true })
      expect(staged.content).not.toBeNull()
    } finally {
      resetBackupEncryption()
    }
  })

  it('a per-run override wins over the wired settings password', async () => {
    const { wireBackupEncryption, resetBackupEncryption } = await import('@/server/domains/backup/services/backup')
    const { stageBackup } = await import('@/server/domains/backup/services/restore')
    const { rmSync } = await import('node:fs')

    wireBackupEncryption({ resolveEncryptionPassword: () => 'settings-password' })
    try {
      const { fileName } = await createBackup(db, null, { passwordOverride: 'one-off-password' })
      const buffer = mem.store.get(`backup/${fileName}`)?.body
      expect(buffer).toBeDefined()
      // The settings password does NOT fit this archive.
      await expect(stageBackup(buffer!, { password: 'settings-password' })).rejects.toThrow(ActionFailure)
      const staged = await stageBackup(buffer!, { password: 'one-off-password' })
      rmSync(staged.dir, { recursive: true, force: true })
      expect(staged.content).not.toBeNull()
    } finally {
      resetBackupEncryption()
    }
  })
})
