import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { clearAllTables, createTestDatabaseFile, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { __adoptAnalyticsHandleForTests, __resetAnalyticsEngineForTests } from '@/server/bootstrap/analytics-lifecycle'

let analyticsHandle: AnalyticsHandle

import { extractBackupFile, unpackBackupPayload } from '#/_helpers/backup-buffer'
import { createBackup, getBackupBuffer } from '@/server/domains/backup/services/backup'
import { findBackupByTimestamp } from '@/server/infra/db/operations/backup'
import { category } from '@/server/infra/db/schema/taxonomy'
import { ActionFailure } from '@/server/infra/http/errors'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// Route the storage registry at the shared in-memory backend (injected as
// 's3', so it is also the ACTIVE backend) — createBackup/getBackupBuffer
// round-trip without real S3 or settings.
const mem = makeMemoryBackend()

const db = getTestDb()

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  analyticsHandle = await createTestAnalyticsDb()
  // The real snapshotAnalyticsTo runs against the adopted handle.
  __resetAnalyticsEngineForTests()
  __adoptAnalyticsHandleForTests(analyticsHandle)
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

    expect(fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db\.tar\.gz$/)
    expect(size).toBeGreaterThan(0)

    const key = `backup/${fileName}`
    const buffer = mem.store.get(key)?.body
    expect(buffer).toBeDefined()
    expect(buffer!.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))

    // The decompressed payload is a tar archive with both engine files,
    // each magic-valid.
    const payload = unpackBackupPayload(extractBackupFile(buffer!))
    expect(payload.content!.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0')
    expect(payload.analytics).not.toBeNull()
    expect(payload.analytics!.subarray(8, 12).toString('latin1')).toBe('DUCK')

    // The backup row is listed and downloadable through the same backend.
    const downloaded = await getBackupBuffer(db, timestamp)
    expect(downloaded.equals(buffer!)).toBe(true)

    // The seeded category is inside the archived content file: a fresh
    // database opened on the extracted bytes finds it. (Written to a NEW
    // path — overwriting an open handle's file would corrupt it.)
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

    // The seeded access events are inside the archived sidecar file.
    const { openAnalyticsDatabase, closeAnalyticsDatabase } = await import('@/server/infra/analytics/duckdb')
    const { ACCESS_LOG_DDL } = await import('@/server/domains/analytics/services/access-log')
    writeFileSync(join(dir, 'restored.duckdb'), payload.analytics!)
    const restoredAnalytics = await openAnalyticsDatabase(join(dir, 'restored.duckdb'), ACCESS_LOG_DDL)
    try {
      const result = await restoredAnalytics.reader.runAndReadAll('SELECT count(*) AS c FROM access_log')
      expect(Number(result.getRowObjects()[0]?.c)).toBe(2)
    } finally {
      await closeAnalyticsDatabase(restoredAnalytics)
    }

    // The staged (streaming) restore path extracts the same archive
    // without holding it in memory — both staged files validate and the
    // staged content file opens as a real database.
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
    // Regression: a `gzip.on('data')` byte counter forced the gzip stream
    // into flowing mode, bypassing the pipe's backpressure and racing the
    // backend consumer — the stored archive deterministically lost its
    // first chunk (the 10-byte gzip header) while byteSize still counted
    // it, so downloads (Content-Length = byteSize) corrupted. The size now
    // comes from the backend's putStream return value.
    //
    // The backend below consumes one tick late, like the local backend's
    // pipeline: a flowing-mode gzip has already emitted — and lost — its
    // first chunk by the time the drain attaches.
    //
    // The 20ms is WALL-CLOCK on purpose and must not become a fake timer
    // or a setImmediate turn: zlib compresses off the event loop (thread
    // pool), so no fixed number of turns can guarantee the buggy flowing-
    // mode gzip has emitted its first chunk before the consumer attaches.
    // The regression this stages is itself a wall-clock race.
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
    // The archive is intact from byte zero — gzip magic, not a truncation.
    expect(stored.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))
    // The recorded/uploaded size IS the stored object size, byte for byte.
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
