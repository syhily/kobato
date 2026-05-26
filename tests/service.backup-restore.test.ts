import { createGzip } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { extractBackupSql, validateBackupSql } from '@/server/domains/backup/service'
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
