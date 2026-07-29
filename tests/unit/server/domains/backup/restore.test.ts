import { createGzip } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { extractBackupFile, unpackBackupPayload } from '#/_helpers/backup-buffer'
import { packTar } from '#/_helpers/backup-buffer'
import { ActionFailure } from '@/server/infra/http/errors'

async function gzipBytes(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const gzip = createGzip()
    gzip.on('data', (chunk: Buffer) => chunks.push(chunk))
    gzip.on('end', () => resolve(Buffer.concat(chunks)))
    gzip.on('error', reject)
    gzip.end(input)
  })
}

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1')

function fakeSqliteFile(size = 512): Buffer {
  return Buffer.concat([SQLITE_HEADER, Buffer.alloc(size - SQLITE_HEADER.length, 0)])
}

function fakeDuckdbFile(size = 512): Buffer {
  const buffer = Buffer.alloc(size, 0)
  buffer.write('DUCK', 8, 'latin1')
  return buffer
}

describe('services/backup — extractBackupFile', () => {
  it('passes a raw payload through unchanged', () => {
    const raw = fakeSqliteFile()
    const out = extractBackupFile(raw)
    expect(out.equals(raw)).toBe(true)
  })

  it('gunzips a gzipped payload', async () => {
    const raw = fakeSqliteFile()
    const zipped = await gzipBytes(raw)
    const out = extractBackupFile(zipped)
    expect(out.equals(raw)).toBe(true)
  })
})

describe('services/backup — unpackBackupPayload', () => {
  it('accepts a legacy raw SQLite payload as content-only', () => {
    const raw = fakeSqliteFile()
    const payload = unpackBackupPayload(raw)
    expect(payload.content!.equals(raw)).toBe(true)
    expect(payload.analytics).toBeNull()
  })

  it('unpacks a two-file tar archive with both engine files', () => {
    const content = fakeSqliteFile()
    const analytics = fakeDuckdbFile()
    const archive = packTar([
      { name: 'kobato.db', data: content },
      { name: 'analytics.duckdb', data: analytics },
    ])
    const payload = unpackBackupPayload(archive)
    expect(payload.content!.equals(content)).toBe(true)
    expect(payload.analytics!.equals(analytics)).toBe(true)
  })

  it('accepts a raw DuckDB payload as an analytics-only restore', () => {
    const analytics = fakeDuckdbFile()
    const payload = unpackBackupPayload(analytics)
    expect(payload.content).toBeNull()
    expect(payload.analytics!.equals(analytics)).toBe(true)
  })

  it('rejects an analytics-only upload for the setup admin check', async () => {
    const { assertBackupContainsAdmin } = await import('#/_helpers/backup-buffer')
    await expect(assertBackupContainsAdmin(fakeDuckdbFile())).rejects.toThrow('备份中不包含管理员账号')
  })

  it('rejects an archive missing the content entry', () => {
    const archive = packTar([{ name: 'analytics.duckdb', data: fakeDuckdbFile() }])
    expect(() => unpackBackupPayload(archive)).toThrow('kobato.db')
  })

  it('rejects an archive with a corrupt analytics entry', () => {
    const archive = packTar([
      { name: 'kobato.db', data: fakeSqliteFile() },
      { name: 'analytics.duckdb', data: Buffer.alloc(512, 1) },
    ])
    expect(() => unpackBackupPayload(archive)).toThrow('DuckDB')
  })

  it('rejects a payload without the SQLite magic header', () => {
    expect(() => unpackBackupPayload(Buffer.from('not a database at all'))).toThrow(ActionFailure)
    expect(() => unpackBackupPayload(Buffer.from('not a database at all'))).toThrow('SQLite')
  })

  it('rejects an empty payload', () => {
    expect(() => unpackBackupPayload(Buffer.alloc(0))).toThrow(ActionFailure)
  })

  it('rejects an oversize payload', () => {
    const big = Buffer.concat([SQLITE_HEADER, Buffer.alloc(501 * 1024 * 1024, 0)])
    expect(() => unpackBackupPayload(big)).toThrow(ActionFailure)
  })
})
