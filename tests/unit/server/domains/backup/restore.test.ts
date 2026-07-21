import { createGzip } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { extractBackupSql, readTimescaleVersionFromDump } from '@/server/domains/backup/services/restore'
import { validateBackupSql } from '@/server/domains/backup/services/validate'
import { ActionFailure } from '@/server/infra/http/errors'

async function gzipString(input: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const gzip = createGzip()
    gzip.on('data', (chunk: Buffer) => chunks.push(chunk))
    gzip.on('end', () => resolve(Buffer.concat(chunks)))
    gzip.on('error', reject)
    gzip.end(input)
  })
}

describe('services/backup — extractBackupSql', () => {
  it('extracts plain .sql file', async () => {
    const sql = 'CREATE TABLE users (id INT);'
    const buffer = Buffer.from(sql, 'utf-8')
    const result = await extractBackupSql(buffer, 'backup.sql')
    expect(result).toBe(sql)
  })

  it('extracts .sql.gz file', async () => {
    const sql = 'CREATE TABLE users (id INT);'
    const gzipped = await gzipString(sql)
    const result = await extractBackupSql(gzipped, 'backup.sql.gz')
    expect(result).toBe(sql)
  })

  it('rejects non-gzip data with .sql.gz extension', async () => {
    const buffer = Buffer.from('not gzip data', 'utf-8')
    await expect(extractBackupSql(buffer, 'backup.sql.gz')).rejects.toThrow(ActionFailure)
  })

  it('extracts plain .gz file', async () => {
    const sql = 'CREATE TABLE users (id INT);'
    const gzipped = await gzipString(sql)
    const result = await extractBackupSql(gzipped, 'backup.gz')
    expect(result).toBe(sql)
  })

  it('rejects non-gzip data with .gz extension', async () => {
    const buffer = Buffer.from('not gzip data', 'utf-8')
    await expect(extractBackupSql(buffer, 'backup.gz')).rejects.toThrow(ActionFailure)
  })

  it('rejects unsupported file extensions', async () => {
    const buffer = Buffer.from('some data', 'utf-8')
    await expect(extractBackupSql(buffer, 'backup.zip')).rejects.toThrow(ActionFailure)
  })
})

describe('services/backup — validateBackupSql', () => {
  it('accepts pg_dump header', () => {
    expect(() => validateBackupSql('-- PostgreSQL database dump\nCREATE TABLE t (id INT);')).not.toThrow()
  })

  it('accepts CREATE TABLE without pg_dump header', () => {
    expect(() => validateBackupSql('CREATE TABLE users (id INT);')).not.toThrow()
  })

  it('accepts INSERT INTO without pg_dump header', () => {
    expect(() => validateBackupSql('INSERT INTO users (id) VALUES (1);')).not.toThrow()
  })

  it('rejects content without any backup indicators', () => {
    expect(() => validateBackupSql('hello world')).toThrow(ActionFailure)
  })

  it('rejects empty string', () => {
    expect(() => validateBackupSql('')).toThrow(ActionFailure)
  })
})

describe('services/backup — readTimescaleVersionFromDump', () => {
  it('returns null when no TimescaleDB metadata block exists', () => {
    const sql = 'CREATE TABLE users (id INT);'
    expect(readTimescaleVersionFromDump(sql)).toBeNull()
  })

  it('extracts a valid semver version from the metadata block', () => {
    const sql =
      'COPY _timescaledb_catalog.metadata (key, value) FROM stdin;\n' + 'timescaledb_version\t2.11.2\n' + '\x5C.'
    expect(readTimescaleVersionFromDump(sql)).toBe('2.11.2')
  })

  it('throws when the version string contains malicious characters', () => {
    const sql =
      'COPY _timescaledb_catalog.metadata (key, value) FROM stdin;\n' +
      'timescaledb_version\t2.11.2; DROP TABLE users;\n' +
      '\x5C.'
    expect(() => readTimescaleVersionFromDump(sql)).toThrow(ActionFailure)
  })

  it('throws when the version string is not semver-shaped', () => {
    const sql =
      'COPY _timescaledb_catalog.metadata (key, value) FROM stdin;\n' + 'timescaledb_version\tv2.11\n' + '\x5C.'
    expect(() => readTimescaleVersionFromDump(sql)).toThrow(ActionFailure)
  })

  it('accepts a version with multiple digits per component', () => {
    const sql =
      'COPY _timescaledb_catalog.metadata (key, value) FROM stdin;\n' + 'timescaledb_version\t2.11.202\n' + '\x5C.'
    expect(readTimescaleVersionFromDump(sql)).toBe('2.11.202')
  })

  it('rejects versions with extra segments', () => {
    const sql =
      'COPY _timescaledb_catalog.metadata (key, value) FROM stdin;\n' + 'timescaledb_version\t2.11.2.1\n' + '\x5C.'
    expect(() => readTimescaleVersionFromDump(sql)).toThrow(ActionFailure)
  })

  it('rejects pre-release / build suffixes', () => {
    const sql =
      'COPY _timescaledb_catalog.metadata (key, value) FROM stdin;\n' + 'timescaledb_version\t2.11.2-beta\n' + '\x5C.'
    expect(() => readTimescaleVersionFromDump(sql)).toThrow(ActionFailure)
  })

  it('rejects empty and whitespace-only versions', () => {
    for (const bad of [' ', '2.11.2 ']) {
      const sql =
        'COPY _timescaledb_catalog.metadata (key, value) FROM stdin;\n' + `timescaledb_version\t${bad}\n` + '\x5C.'
      expect(() => readTimescaleVersionFromDump(sql)).toThrow(ActionFailure)
    }
  })
})
