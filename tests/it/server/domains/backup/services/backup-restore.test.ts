import { eq } from 'drizzle-orm'
import { Readable } from 'node:stream'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database, DatabaseHandle } from '@/server/infra/db/database'

import { clearAllTables, closeTestDatabase, createTestDatabase } from '#/_helpers/integration-db'
import { createBackup, getBackupBuffer } from '@/server/domains/backup/services/backup'
import { extractBackupFile } from '@/server/domains/backup/services/restore'
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

const handle: DatabaseHandle = createTestDatabase()
const db: Database = handle.db

afterAll(() => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  await clearAllTables(db)
  s3Mock.clearStore()
})

describe('backup and restore integration', () => {
  it('creates a gzipped SQLite backup that round-trips through the storage backend', async () => {
    await db
      .insert(category)
      .values({ name: 'BackupCat', slug: 'backup-cat', cover: '', description: '', sortOrder: 0 })
      .run()

    const { fileName, size, timestamp } = await createBackup(db)

    expect(fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db\.gz$/)
    expect(size).toBeGreaterThan(0)

    const key = `backup/${fileName}`
    const buffer = s3Mock.store.get(key)
    expect(buffer).toBeDefined()
    expect(buffer!.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))

    // The payload is a real SQLite database once decompressed — and it
    // carries the seeded row.
    const raw = extractBackupFile(buffer!)
    expect(raw.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0')

    // The backup row is listed and downloadable through the same backend.
    const downloaded = await getBackupBuffer(db, timestamp)
    expect(downloaded.equals(buffer!)).toBe(true)

    // The seeded row is inside the backup: a fresh database opened on the
    // extracted bytes finds it.
    const restored = createTestDatabase()
    try {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(restored.path, raw)
      const rows = restored.db.select().from(category).where(eq(category.slug, 'backup-cat')).all()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.name).toBe('BackupCat')
    } finally {
      closeTestDatabase(restored)
    }
  })

  it('rejects a payload that is not a SQLite database', () => {
    expect(() => extractBackupFile(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toThrow(ActionFailure)
    expect(() => extractBackupFile(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toThrow('SQLite')
  })

  it('rejects an oversize payload', () => {
    const big = Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(501 * 1024 * 1024, 0)])
    expect(() => extractBackupFile(big)).toThrow(ActionFailure)
  })

  it('passes a raw (ungzipped) SQLite file through', async () => {
    const fresh = createTestDatabase()
    try {
      const { readFileSync } = await import('node:fs')
      const bytes: Buffer = readFileSync(fresh.path)
      const out = extractBackupFile(bytes)
      expect(out.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0')
    } finally {
      closeTestDatabase(fresh)
    }
  })
})
