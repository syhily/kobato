import { beforeEach, describe, expect, it, vi } from 'vitest'

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
import { ActionFailure } from '@/server/infra/http/errors'

vi.mock('@/server/infra/storage/s3-client', () => ({
  listS3Objects: vi.fn(),
  listS3ObjectsPaginated: vi.fn(),
  deleteS3Objects: vi.fn(),
  deleteS3Object: vi.fn(),
  getS3ObjectBuffer: vi.fn(),
  putS3Object: vi.fn(),
}))

const s3Mock = () => import('@/server/infra/storage/s3-client')

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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps S3 objects to BackupFileDto with valid timestamps', async () => {
    const { listS3ObjectsPaginated } = await s3Mock()
    vi.mocked(listS3ObjectsPaginated).mockResolvedValue({
      objects: [
        {
          key: 'backup/backup-2026-06-13T10-30-00.sql.gz',
          size: 100,
          lastModified: new Date('2026-06-13T10:30:00Z'),
        },
        {
          key: 'backup/backup-not-a-timestamp.sql.gz',
          size: 50,
          lastModified: new Date('2026-06-12T00:00:00Z'),
        },
      ],
    })
    const { files } = await listBackups()
    expect(files).toHaveLength(1)
    expect(files[0]!.key).toBe('2026-06-13T10-30-00')
    expect(files[0]!.size).toBe(100)
  })

  it('returns an empty list when S3 returns 503', async () => {
    const { listS3ObjectsPaginated } = await s3Mock()
    const err = Object.assign(new Error('service unavailable'), { status: 503 })
    vi.mocked(listS3ObjectsPaginated).mockRejectedValue(err)
    expect(await listBackups()).toEqual({ files: [] })
  })

  it('returns empty on other errors too (defensive)', async () => {
    const { listS3ObjectsPaginated } = await s3Mock()
    vi.mocked(listS3ObjectsPaginated).mockRejectedValue(new Error('boom'))
    expect(await listBackups()).toEqual({ files: [] })
  })
})

describe('backup/backup — cleanupOldBackups & deleteBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cleanupOldBackups deletes only objects past the cutoff', async () => {
    const { listS3Objects, deleteS3Objects } = await s3Mock()
    vi.mocked(listS3Objects).mockResolvedValue([
      { key: 'backup/old.sql.gz', size: 0, lastModified: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      { key: 'backup/new.sql.gz', size: 0, lastModified: new Date() },
    ])
    await cleanupOldBackups(30)
    expect(deleteS3Objects).toHaveBeenCalledWith(['backup/old.sql.gz'])
  })

  it('cleanupOldBackups is a no-op when nothing is old', async () => {
    const { listS3Objects, deleteS3Objects } = await s3Mock()
    vi.mocked(listS3Objects).mockResolvedValue([{ key: 'backup/fresh.sql.gz', size: 0, lastModified: new Date() }])
    await cleanupOldBackups(30)
    expect(deleteS3Objects).not.toHaveBeenCalled()
  })

  it('deleteBackup calls deleteS3Object with the key', async () => {
    const { deleteS3Object } = await s3Mock()
    await deleteBackup('backup/x.sql.gz')
    expect(deleteS3Object).toHaveBeenCalledWith('backup/x.sql.gz')
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
