import { eq } from 'drizzle-orm'
import { Readable } from 'node:stream'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'
import type { Database, DatabaseHandle } from '@/server/infra/db/database'

import { closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { clearAllTables, createTestDatabaseFile, getTestDb } from '#/_helpers/integration-db'

let analyticsHandle: AnalyticsHandle

vi.mock('@/server/bootstrap/analytics-lifecycle', () => ({
  // Same contract as the real seam, driven against the test's real
  // temp-file DuckDB handle.
  snapshotAnalyticsTo: async (stagingPath: string) => {
    if (analyticsHandle.inMemory) {
      return false
    }
    await analyticsHandle.writer.run('CHECKPOINT')
    const { copyFile } = await import('node:fs/promises')
    await copyFile(analyticsHandle.path, stagingPath)
    return true
  },
}))

import { extractBackupFile, unpackBackupPayload } from '#/_helpers/backup-buffer'
import { createBackup, getBackupBuffer } from '@/server/domains/backup/services/backup'
import { category } from '@/server/infra/db/schema/taxonomy'
import { ActionFailure } from '@/server/infra/http/errors'

const s3Mock = vi.hoisted(() => {
  const store = new Map<string, Buffer>()
  return {
    store,
    clearStore: () => store.clear(),
  }
})

// Route the storage registry at an in-memory backend backed by `s3Mock.store`
// so createBackup/getBackupBuffer round-trip without real S3 or settings.
vi.mock('@/server/infra/storage/registry', () => {
  const drain = async (body: AsyncIterable<unknown>): Promise<Buffer> => {
    const chunks: Buffer[] = []
    for await (const chunk of body) {
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks)
  }
  const backend = {
    driver: 's3',
    isAvailable: () => true,
    put: async ({ key, body }: { key: string; body: Buffer }) => {
      s3Mock.store.set(key, body)
      return { key, size: body.length }
    },
    putStream: async ({ key, body }: { key: string; body: AsyncIterable<unknown> }) => {
      const buf = await drain(body)
      s3Mock.store.set(key, buf)
      return { key, size: buf.length }
    },
    get: async (key: string) => {
      const b = s3Mock.store.get(key)
      if (b === undefined) {
        throw new Error(`S3 mock: object not found: ${key}`)
      }
      return b
    },
    getStream: async (key: string) => {
      const b = s3Mock.store.get(key)
      if (b === undefined) {
        throw new Error(`S3 mock: object not found: ${key}`)
      }
      return Readable.from([b])
    },
    delete: async () => {},
    deleteMany: async () => {},
    exists: async () => false,
    list: async () => [],
  }
  return { activeBackend: () => ({ backend, driver: 's3' }), backendFor: () => backend }
})

const db = getTestDb()

beforeEach(async () => {
  analyticsHandle = await createTestAnalyticsDb()
  await clearAllTables(db)
  s3Mock.clearStore()
})

afterAll(async () => {
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
    const buffer = s3Mock.store.get(key)
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
