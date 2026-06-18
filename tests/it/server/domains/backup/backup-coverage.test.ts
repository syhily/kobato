import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import {
  buildBackupS3Key,
  isValidBackupKey,
  cleanupOldBackups,
  deleteBackup,
  listBackups,
} from '@/server/domains/backup/services/backup'
import {
  extractBackupSql,
  validateSemverForSql,
  readTimescaleVersionFromDump,
  TIMESCALEDB_VERSION_RE,
} from '@/server/domains/backup/services/restore'
import { getPgConnectionOptions, MAX_SQL_SIZE } from '@/server/domains/backup/services/shared'
import { validateBackupSql } from '@/server/domains/backup/services/validate'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { backup } from '@/server/infra/db/schema/backup'
import { ActionFailure } from '@/server/infra/http/errors'

// In-memory storage backend so listBackups/deleteBackup/cleanupOldBackups
// exercise the DB-backed backup table without real S3 or a local disk.
const memoryStore = vi.hoisted(() => {
  const objects = new Map<string, { size: number; driver: 's3' | 'local' }>()
  const deletedKeys = new Set<string>()
  return {
    objects,
    deletedKeys,
    reset: () => {
      objects.clear()
      deletedKeys.clear()
    },
  }
})

vi.mock('@/server/infra/storage/backends/local', () => ({
  localBackend: {
    driver: 'local',
    isAvailable: () => true,
    list: async (prefix: string) =>
      [...memoryStore.objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, meta]) => ({ key, size: meta.size, lastModified: new Date() })),
    delete: async (key: string) => {
      memoryStore.deletedKeys.add(key)
    },
  },
  resolveLocalPath: (key: string) => key,
}))

vi.mock('@/server/infra/storage/backends/s3', () => ({
  s3Backend: {
    driver: 's3',
    isAvailable: () => true,
    list: async (prefix: string) =>
      [...memoryStore.objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, meta]) => ({ key, size: meta.size, lastModified: new Date() })),
  },
}))

vi.mock('@/server/infra/storage/registry', () => ({
  activeBackend: () => ({ backend: { put: vi.fn() }, driver: 's3' }),
  backendFor: (driver: 's3' | 'local') => ({
    delete: async (key: string) => {
      memoryStore.deletedKeys.add(key)
    },
    get: async () => Buffer.alloc(0),
  }),
}))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

describe('backup/validate — validateBackupSql', () => {
  it('accepts a clean pg_dump script with INSERT/CREATE TABLE', () => {
    const sql = `
-- PostgreSQL database dump
CREATE TABLE foo (id int);
INSERT INTO foo VALUES (1);
SET statement_timeout = 0;
`
    expect(() => validateBackupSql(sql)).not.toThrow()
  })

  it('rejects a buffer that does not look like a pg dump', () => {
    expect(() => validateBackupSql('hello world this is plain text')).toThrow(/不符合/)
  })

  it('rejects DROP DATABASE statements', () => {
    expect(() => validateBackupSql('-- PostgreSQL database dump\nDROP DATABASE foo;')).toThrow(/危险 SQL/)
  })

  it('rejects SET ROLE privilege escalation', () => {
    expect(() => validateBackupSql('-- PostgreSQL database dump\nSET ROLE superuser;')).toThrow()
  })

  it('rejects non-stdin COPY FROM', () => {
    expect(() => validateBackupSql("-- PostgreSQL database dump\nCOPY foo TO PROGRAM 'rm -rf /';")).toThrow()
  })

  it('rejects CREATE FUNCTION with untrusted language', () => {
    expect(() =>
      validateBackupSql(
        '-- PostgreSQL database dump\nCREATE FUNCTION evil() RETURNS int LANGUAGE plpython3u AS $$ import os; os.system("rm -rf /") $$;',
      ),
    ).toThrow()
  })

  it('rejects disallowed extensions', () => {
    expect(() => validateBackupSql('-- PostgreSQL database dump\nCREATE EXTENSION evil_ext;')).toThrow(/扩展/)
  })

  it('allows project-required extensions (timescaledb, vector)', () => {
    expect(() =>
      validateBackupSql(
        '-- PostgreSQL database dump\nCREATE EXTENSION IF NOT EXISTS timescaledb;\nCREATE EXTENSION IF NOT EXISTS vector;',
      ),
    ).not.toThrow()
  })

  it('rejects psql meta-commands like \\connect', () => {
    expect(() => validateBackupSql('-- PostgreSQL database dump\n\\connect foo')).toThrow()
  })

  it('rejects oversized files', () => {
    const sql = 'a'.repeat(MAX_SQL_SIZE + 1) + '\nPostgreSQL database dump'
    expect(() => validateBackupSql(sql)).toThrow(/过大/)
  })
})

describe('backup/restore — extractBackupSql', () => {
  it('returns .sql buffers as utf-8 strings', async () => {
    const buf = Buffer.from('-- PostgreSQL database dump\nSELECT 1;', 'utf-8')
    expect(await extractBackupSql(buf, 'foo.sql')).toBe('-- PostgreSQL database dump\nSELECT 1;')
  })

  it('rejects oversized .sql files', async () => {
    const buf = Buffer.alloc(MAX_SQL_SIZE + 1, 0x61)
    await expect(extractBackupSql(buf, 'foo.sql')).rejects.toThrow(/过大/)
  })

  it('rejects unknown file extensions', async () => {
    await expect(extractBackupSql(Buffer.from('x'), 'foo.bin')).rejects.toThrow(/不支持/)
  })

  it('rejects malformed gzip files', async () => {
    await expect(extractBackupSql(Buffer.from([0x00, 0x00]), 'foo.gz')).rejects.toThrow(/gzip/)
  })

  it('decompresses valid .gz files', async () => {
    const { gzipSync } = await import('node:zlib')
    const original = '-- PostgreSQL database dump\nSELECT 1;'
    const gz = gzipSync(Buffer.from(original))
    expect(await extractBackupSql(gz, 'foo.gz')).toBe(original)
  })
})

describe('backup/restore — version helpers', () => {
  it('validateSemverForSql accepts x.y.z', () => {
    expect(validateSemverForSql('2.13.1')).toBe(true)
    expect(validateSemverForSql('2.13')).toBe(false)
    expect(validateSemverForSql('2.13.1-rc')).toBe(false)
  })

  it('TIMESCALEDB_VERSION_RE matches plain semver', () => {
    expect(TIMESCALEDB_VERSION_RE.test('2.13.1')).toBe(true)
    expect(TIMESCALEDB_VERSION_RE.test('2.13.1-dev')).toBe(false)
  })

  it('readTimescaleVersionFromDump returns null when no COPY block exists', () => {
    expect(readTimescaleVersionFromDump('-- no metadata\nSELECT 1;')).toBeNull()
  })

  it('readTimescaleVersionFromDump extracts the version from the COPY block', () => {
    const T = '\t'
    const sql = [
      '-- PostgreSQL database dump',
      'COPY _timescaledb_catalog.metadata (key, value, include_in_telemetry) FROM stdin;',
      `timescaledb_version${T}2.13.1`,
      `install_timestamp${T}2024-01-01T00:00:00.000Z`,
      '\\.',
    ].join('\n')
    expect(readTimescaleVersionFromDump(sql)).toBe('2.13.1')
  })

  it('readTimescaleVersionFromDump throws on malformed version strings', () => {
    const T = '\t'
    const sql = [
      'COPY _timescaledb_catalog.metadata (key, value, include_in_telemetry) FROM stdin;',
      `timescaledb_version${T}not-a-semver`,
      '\\.',
    ].join('\n')
    expect(() => readTimescaleVersionFromDump(sql)).toThrow(/TimescaleDB/)
  })
})

describe('backup/backup — isValidBackupKey & buildBackupS3Key', () => {
  it('accepts canonical timestamps', () => {
    expect(isValidBackupKey('2026-06-13T10-30-00')).toBe(true)
    expect(isValidBackupKey('not-a-timestamp')).toBe(false)
    expect(isValidBackupKey('2026-06-13')).toBe(false)
  })

  it('buildBackupS3Key formats the canonical path', () => {
    expect(buildBackupS3Key('2026-06-13T10-30-00')).toBe('backup/backup-2026-06-13T10-30-00.sql.gz')
  })
})

describe('backup/backup — listBackups', () => {
  beforeEach(async () => {
    memoryStore.reset()
    await clearAllTables(db)
  })

  it('returns rows from the backup table, newest first', async () => {
    await db.insert(backup).values([
      {
        timestamp: '2026-06-12T00-00-00',
        storagePath: 'backup/backup-2026-06-12T00-00-00.sql.gz',
        storageDriver: 's3',
        byteSize: 50,
      },
      {
        timestamp: '2026-06-13T10-30-00',
        storagePath: 'backup/backup-2026-06-13T10-30-00.sql.gz',
        storageDriver: 's3',
        byteSize: 100,
      },
    ])
    const { files } = await listBackups(db)
    expect(files).toHaveLength(2)
    expect(files[0]!.key).toBe('2026-06-13T10-30-00')
    expect(files[0]!.size).toBe(100)
  })

  it('reconciles unrecorded backend objects into the table (self-healing)', async () => {
    // A file exists in storage but has no DB row (e.g. pre-existing S3 backup
    // before the upgrade). listBackups should pick it up.
    memoryStore.objects.set('backup/backup-2026-06-13T10-30-00.sql.gz', { size: 100, driver: 's3' })
    const { files } = await listBackups(db)
    expect(files).toHaveLength(1)
    expect(files[0]!.key).toBe('2026-06-13T10-30-00')
    // A second list does not duplicate the row.
    const { files: again } = await listBackups(db)
    expect(again).toHaveLength(1)
  })
})

describe('backup/backup — cleanupOldBackups & deleteBackup', () => {
  beforeEach(async () => {
    memoryStore.reset()
    await clearAllTables(db)
  })

  it('cleanupOldBackups deletes only rows past the cutoff', async () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    const freshDate = new Date()
    await db.insert(backup).values([
      {
        timestamp: '2026-05-01T00-00-00',
        storagePath: 'backup/backup-2026-05-01T00-00-00.sql.gz',
        storageDriver: 's3',
        byteSize: 0,
        createdAt: oldDate,
      },
      {
        timestamp: '2026-06-14T00-00-00',
        storagePath: 'backup/backup-2026-06-14T00-00-00.sql.gz',
        storageDriver: 's3',
        byteSize: 0,
        createdAt: freshDate,
      },
    ])
    await cleanupOldBackups(db, 30)
    const remaining = await db.select().from(backup)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.timestamp).toBe('2026-06-14T00-00-00')
    expect(memoryStore.deletedKeys.has('backup/backup-2026-05-01T00-00-00.sql.gz')).toBe(true)
  })

  it('cleanupOldBackups is a no-op when nothing is old', async () => {
    await db.insert(backup).values({
      timestamp: '2026-06-14T00-00-00',
      storagePath: 'backup/backup-2026-06-14T00-00-00.sql.gz',
      storageDriver: 's3',
      byteSize: 0,
      createdAt: new Date(),
    })
    await cleanupOldBackups(db, 30)
    expect(await db.select().from(backup)).toHaveLength(1)
  })

  it('deleteBackup removes the row and deletes the stored object', async () => {
    await db.insert(backup).values({
      timestamp: '2026-06-13T10-30-00',
      storagePath: 'backup/backup-2026-06-13T10-30-00.sql.gz',
      storageDriver: 's3',
      byteSize: 8,
    })
    await deleteBackup(db, '2026-06-13T10-30-00')
    expect(await db.select().from(backup)).toHaveLength(0)
    expect(memoryStore.deletedKeys.has('backup/backup-2026-06-13T10-30-00.sql.gz')).toBe(true)
  })

  it('deleteBackup is a no-op when the timestamp is unknown', async () => {
    await deleteBackup(db, '2026-06-13T10-30-00')
    expect(await db.select().from(backup)).toHaveLength(0)
  })
})

describe('backup/shared — getPgConnectionOptions', () => {
  it('parses host/port/db/user from the DATABASE_URL', () => {
    const opts = getPgConnectionOptions()
    expect(opts.args.some((a) => a.startsWith('--host='))).toBe(true)
    expect(opts.args.some((a) => a.startsWith('--dbname='))).toBe(true)
    expect(opts.env.PGHOST).toBeDefined()
    expect(opts.env.PGDATABASE).toBeDefined()
  })
})

describe('backup/restore — restoreFromBackup', () => {
  it('rejects an unsupported file extension via extractBackupSql', async () => {
    const { restoreFromBackup } = await import('@/server/domains/backup/services/restore')
    await expect(restoreFromBackup(dbStub(), Buffer.from('x'), 'foo.bin')).rejects.toThrow(/不支持/)
  })

  it('rejects dangerous SQL via validateBackupSql', async () => {
    const { restoreFromBackup } = await import('@/server/domains/backup/services/restore')
    const buf = Buffer.from('DROP DATABASE foo;', 'utf-8')
    await expect(restoreFromBackup(dbStub(), buf, 'foo.sql')).rejects.toThrow(ActionFailure)
  })
})

function dbStub() {
  return {} as any
}
