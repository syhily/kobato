import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createBackup } from '@/server/domains/backup/services/backup'
import { extractBackupSql, restoreFromBackup } from '@/server/domains/backup/services/restore'
import { BACKUP_HEADER_MARKER } from '@/server/domains/backup/services/validate'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { category } from '@/server/infra/db/schema/taxonomy'
import { ActionFailure } from '@/server/infra/http/errors'

const s3Mock = vi.hoisted(() => {
  const store = new Map<string, Buffer>()
  return {
    store,
    clearStore: () => store.clear(),
  }
})

vi.mock('@/server/infra/storage/s3-client', () => ({
  putS3Object: vi.fn(async (key: string, body: Buffer | AsyncIterable<unknown>) => {
    if (Buffer.isBuffer(body)) {
      s3Mock.store.set(key, body)
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of body) {
      chunks.push(chunk as Buffer)
    }
    s3Mock.store.set(key, Buffer.concat(chunks))
  }),
  getS3ObjectBuffer: vi.fn(async (key: string) => {
    const buffer = s3Mock.store.get(key)
    if (buffer === undefined) {
      throw new Error(`S3 mock: object not found: ${key}`)
    }
    return buffer
  }),
  deleteS3Object: vi.fn(),
  deleteS3Objects: vi.fn(),
  listS3Objects: vi.fn(async () => []),
  listS3ObjectsPaginated: vi.fn(async () => ({ objects: [] })),
  putPublicS3Object: vi.fn(),
}))

let poolManager = createDbPool()
let db: NodePgDatabase = poolManager.db
let pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  s3Mock.clearStore()
})

describe('backup and restore integration', () => {
  it('creates a gzip backup and restores the seeded category row', async () => {
    const inserted = await db
      .insert(category)
      .values({ name: 'BackupCat', slug: 'backup-cat', cover: '', description: '', sortOrder: 0 })
      .returning()

    const { fileName, size } = await createBackup()

    expect(fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql\.gz$/)
    expect(size).toBeGreaterThan(0)

    const key = `backup/${fileName}`
    const buffer = s3Mock.store.get(key)
    expect(buffer).toBeDefined()
    expect(buffer!.length).toBeGreaterThan(2)
    expect(buffer!.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))

    await db.delete(category).where(eq(category.id, inserted[0]!.id))

    await restoreFromBackup(db, buffer!, fileName)

    // Restore drops and recreates tables, so the existing pool connections
    // cache stale relation OIDs. Recreate the pool before verifying.
    await closePool(pool)
    poolManager = createDbPool()
    db = poolManager.db
    pool = poolManager.pool

    const rows = await db.select().from(category).where(eq(category.slug, 'backup-cat'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('BackupCat')
  })

  it('rejects a non-gzip file with wrong magic bytes', async () => {
    await expect(extractBackupSql(Buffer.from([0x00, 0x00]), 'not-a-backup.sql.gz')).rejects.toThrow(
      '备份文件格式不正确',
    )
  })

  it('rejects a backup without the project signature', async () => {
    const sql = `-- PostgreSQL database dump\nCREATE TABLE users (id serial PRIMARY KEY);`
    await expect(restoreFromBackup(db, Buffer.from(sql), 'unsigned.sql')).rejects.toThrow(ActionFailure)
    await expect(restoreFromBackup(db, Buffer.from(sql), 'unsigned.sql')).rejects.toThrow('项目签名')
  })

  it('rejects a backup containing a blocked plpython3u extension', async () => {
    const sql = `${BACKUP_HEADER_MARKER}\n-- PostgreSQL database dump\nCREATE EXTENSION IF NOT EXISTS plpython3u;\nCREATE TABLE users (id serial PRIMARY KEY);`
    await expect(restoreFromBackup(db, Buffer.from(sql), 'evil-ext.sql')).rejects.toThrow(ActionFailure)
    await expect(restoreFromBackup(db, Buffer.from(sql), 'evil-ext.sql')).rejects.toThrow('不允许的数据库扩展')
  })

  it('rejects a backup containing COPY FROM a file path', async () => {
    const sql = `${BACKUP_HEADER_MARKER}\n-- PostgreSQL database dump\nCOPY users (email) FROM '/etc/passwd';\nCREATE TABLE users (id serial PRIMARY KEY);`
    await expect(restoreFromBackup(db, Buffer.from(sql), 'evil-copy.sql')).rejects.toThrow(ActionFailure)
  })

  it('rejects a backup containing a SECURITY DEFINER function', async () => {
    const sql = `${BACKUP_HEADER_MARKER}\n-- PostgreSQL database dump\nCREATE FUNCTION evil() RETURNS void SECURITY DEFINER AS $$ BEGIN PERFORM pg_read_file('/etc/passwd'); END; $$ LANGUAGE plpgsql;\nCREATE TABLE users (id serial PRIMARY KEY);`
    await expect(restoreFromBackup(db, Buffer.from(sql), 'evil-function.sql')).rejects.toThrow(ActionFailure)
    await expect(restoreFromBackup(db, Buffer.from(sql), 'evil-function.sql')).rejects.toThrow('危险 SQL')
  })
})
