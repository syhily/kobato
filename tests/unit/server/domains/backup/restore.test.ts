import { createGzip } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { extractBackupFile } from '@/server/domains/backup/services/restore'
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

describe('services/backup — extractBackupFile', () => {
  it('passes a raw SQLite file through unchanged', () => {
    const raw = fakeSqliteFile()
    const out = extractBackupFile(raw)
    expect(out.equals(raw)).toBe(true)
  })

  it('gunzips a gzipped SQLite file', async () => {
    const raw = fakeSqliteFile()
    const zipped = await gzipBytes(raw)
    const out = extractBackupFile(zipped)
    expect(out.equals(raw)).toBe(true)
  })

  it('rejects a payload without the SQLite magic header', () => {
    expect(() => extractBackupFile(Buffer.from('not a database at all'))).toThrow(ActionFailure)
    expect(() => extractBackupFile(Buffer.from('not a database at all'))).toThrow('SQLite')
  })

  it('rejects an empty payload', () => {
    expect(() => extractBackupFile(Buffer.alloc(0))).toThrow(ActionFailure)
  })

  it('rejects an oversize payload', () => {
    const big = Buffer.concat([SQLITE_HEADER, Buffer.alloc(501 * 1024 * 1024, 0)])
    expect(() => extractBackupFile(big)).toThrow(ActionFailure)
  })
})
