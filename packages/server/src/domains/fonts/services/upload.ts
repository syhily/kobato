import type { AdminFontDto } from '@kobato/contracts/fonts.ts'
import type { Database } from '@kobato/db/database.ts'
import type { FontRow } from '@kobato/db/schema/font.ts'

import { font } from '@kobato/db/schema/font.ts'
import { findFontByHash, toAdminFontDto } from '@kobato/server/domains/fonts/services/read.ts'
import { sliceFont } from '@kobato/server/domains/fonts/slice.ts'
import { putFont, fontCssKey, type FontPackageFile } from '@kobato/server/domains/fonts/storage.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { createHash } from 'node:crypto'

/** Max accepted upload size for a source TTF/OTF. Matches the Canvas font route. */
export const FONT_MAX_BYTES = 60 * 1024 * 1024 // 60 MiB

/** Magic-byte kind check — TTF `00 01 00 00`, OTF `OTTO`, else null. */
export function detectFontKind(buffer: Uint8Array): 'ttf' | 'otf' | null {
  if (buffer.length < 4) {
    return null
  }
  if (buffer[0] === 0x00 && buffer[1] === 0x01 && buffer[2] === 0x00 && buffer[3] === 0x00) {
    return 'ttf'
  }
  if (buffer[0] === 0x4f && buffer[1] === 0x54 && buffer[2] === 0x54 && buffer[3] === 0x4f) {
    return 'otf'
  }
  return null
}

export function validateFontTableBounds(buffer: Uint8Array): void {
  if (buffer.length < 12) {
    throw new DomainError('BAD_REQUEST', descriptorFor('fonts.error.tableDirectory'))
  }
  const numTables = (buffer[4] << 8) | buffer[5]
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16
    if (off + 16 > buffer.length) {
      throw new DomainError(
        'BAD_REQUEST',
        descriptorFor('fonts.error.tableTruncated', { index: i + 1, total: numTables }),
      )
    }
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3])
    const tableOffset = (buffer[off + 8] << 24) | (buffer[off + 9] << 16) | (buffer[off + 10] << 8) | buffer[off + 11]
    const tableLength = (buffer[off + 12] << 24) | (buffer[off + 13] << 16) | (buffer[off + 14] << 8) | buffer[off + 15]
    if (tableOffset + tableLength > buffer.length) {
      throw new DomainError(
        'BAD_REQUEST',
        descriptorFor('fonts.error.tableOutOfBounds', {
          tag,
          offset: tableOffset,
          length: tableLength,
          size: buffer.length,
        }),
      )
    }
  }
}

function sha256Hex(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export interface UploadFontInput {
  buffer: Uint8Array
  sourceName: string
  familyName: string
}

/** Upload + slice + store + insert. Idempotent on source bytes — same sha256 returns the existing row. */
export async function uploadFont(db: Database, input: UploadFontInput): Promise<AdminFontDto> {
  const { buffer, sourceName, familyName } = input

  const trimmedFamily = familyName.trim()
  if (trimmedFamily === '') {
    throw new DomainError('BAD_REQUEST', descriptorFor('fonts.error.nameRequired'))
  }
  if (buffer.length === 0) {
    throw new DomainError('BAD_REQUEST', descriptorFor('common.error.uploadEmpty'))
  }
  if (buffer.length > FONT_MAX_BYTES) {
    throw new DomainError('BAD_REQUEST', descriptorFor('fonts.error.tooLarge', { max: FONT_MAX_BYTES }))
  }
  if (!detectFontKind(buffer)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('fonts.error.wrongFormat'))
  }
  validateFontTableBounds(buffer)

  const hash = sha256Hex(buffer)

  const existing = await findFontByHash(db, hash)
  if (existing) {
    return toAdminFontDto(existing)
  }

  const sliced = await sliceFont(Buffer.from(buffer), { fontFamily: trimmedFamily })

  const files: FontPackageFile[] = [
    { name: 'result.css', body: Buffer.from(sliced.css), contentType: 'text/css; charset=utf-8' },
    ...sliced.chunks.map((c) => ({
      name: c.name,
      body: Buffer.from(c.data),
      contentType: 'font/woff2',
    })),
  ]
  const { driver } = await putFont(hash, files)

  // etag = sha256(result.css); repackaging busts caches without changing the storage key.
  const etag = sha256Hex(sliced.css)
  const cssKey = fontCssKey(hash)

  const inserted = await db
    .insert(font)
    .values({
      familyName: trimmedFamily,
      sourceName,
      hash,
      cssKey,
      storageDriver: driver,
      chunkCount: sliced.chunkCount,
      totalBytes: sliced.totalBytes,
      etag,
    })
    .returning()
  const row = inserted[0] as FontRow
  return toAdminFontDto(row)
}
