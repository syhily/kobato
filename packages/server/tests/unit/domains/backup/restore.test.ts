import { extractBackupFile, unpackBackupPayload, packTar } from '#/_helpers/backup-buffer'

import { decompressedSizeGuard, stageBackup } from '@kobato/server/domains/backup/services/restore'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { rmSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { describe, expect, it } from 'vitest'

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

describe('services/backup — stageBackup streaming size guard', () => {
  it('stages a gzipped payload within the cap', async () => {
    const zipped = await gzipBytes(fakeSqliteFile())
    const staged = await stageBackup(Readable.from(zipped))
    try {
      expect(staged.content).not.toBeNull()
    } finally {
      rmSync(staged.dir, { recursive: true, force: true })
    }
  })

  it('aborts a gzip stream whose decompressed size exceeds the cap, without staging it in full', async () => {
    const zipped = await gzipBytes(fakeSqliteFile(4096))
    await expect(stageBackup(Readable.from(zipped), 1024)).rejects.toThrow(ActionFailure)
    await expect(stageBackup(Readable.from(zipped), 1024)).rejects.toThrow('备份文件过大')
  })

  it('fails decompressedSizeGuard once the byte count trips the cap', async () => {
    const seen: Buffer[] = []
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(64), Buffer.alloc(64)]),
        decompressedSizeGuard(100),
        async (source: AsyncIterable<Buffer>) => {
          for await (const chunk of source) {
            seen.push(chunk)
          }
        },
      ),
    ).rejects.toThrow(ActionFailure)
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(64), Buffer.alloc(64)]),
        decompressedSizeGuard(100),
        async (source: AsyncIterable<Buffer>) => {
          for await (const chunk of source) {
            seen.push(chunk)
          }
        },
      ),
    ).rejects.toThrow('备份文件过大')
  })
})
