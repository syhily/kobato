import type { AdminFontDto } from '@kobato/api/contracts/admin/fonts'
import type { Database } from '@kobato/db/sqlite/database'

import { FONT_MAX_BYTES } from '@kobato/api/contracts/admin/fonts'
import { insertFont, updateFontPackage } from '@kobato/db/sqlite/operations/system/font'
import { findFontByHash, toAdminFontDto } from '@kobato/server/domains/fonts/services/read'
import { sliceFont } from '@kobato/server/domains/fonts/slice'
import { deleteStaleFontPackage, fontCssKey, putFont, type FontPackageFile } from '@kobato/server/domains/fonts/storage'
import { fontSplitAlgorithmVersion } from '@kobato/server/domains/fonts/vendor/napi-split'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { createHash } from 'node:crypto'

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

// Coalesce concurrent uploads of the same font bytes (identical sha256) into one slice+store
// pass — slicing a CJK font takes seconds and the work is deterministic, so followers just await
// the leader's result. Process-local is sufficient: the deployment is a single instance.
const inFlightUploads = new Map<string, Promise<AdminFontDto>>()

export interface UploadFontInput {
  buffer: Uint8Array
  sourceName: string
  familyName: string
}

export async function uploadFont(db: Database, input: UploadFontInput): Promise<AdminFontDto> {
  const { buffer, familyName } = input

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
  const pending = inFlightUploads.get(hash)
  if (pending) {
    return pending
  }
  const task = uploadFontExclusive(db, input, trimmedFamily, hash).finally(() => {
    inFlightUploads.delete(hash)
  })
  inFlightUploads.set(hash, task)
  return task
}

async function uploadFontExclusive(
  db: Database,
  input: UploadFontInput,
  trimmedFamily: string,
  hash: string,
): Promise<AdminFontDto> {
  const algorithmVersion = fontSplitAlgorithmVersion()

  const existing = await findFontByHash(db, hash)
  if (existing && existing.cssKey === fontCssKey(hash, algorithmVersion)) {
    return toAdminFontDto(existing)
  }

  const sliced = await sliceFont(Buffer.from(input.buffer), { fontFamily: trimmedFamily })

  const files: FontPackageFile[] = [
    { name: 'result.css', body: Buffer.from(sliced.css), contentType: 'text/css; charset=utf-8' },
    ...sliced.chunks.map((c) => ({
      name: c.name,
      body: Buffer.from(c.data),
      contentType: 'font/woff2',
    })),
  ]
  const { driver } = await putFont(hash, algorithmVersion, files)

  const etag = sha256Hex(sliced.css)
  const cssKey = fontCssKey(hash, algorithmVersion)

  if (existing) {
    // Same font bytes, stale slicing algorithm: re-slice into the versioned keys and repoint the
    // row; the stale package is removed best-effort afterwards.
    await updateFontPackage(db, existing.id, {
      cssKey,
      etag,
      chunkCount: sliced.chunkCount,
      totalBytes: sliced.totalBytes,
      storageDriver: driver,
    })
    await deleteStaleFontPackage(hash, driver, algorithmVersion).catch(() => undefined)
    const refreshed = await findFontByHash(db, hash)
    return toAdminFontDto(refreshed ?? existing)
  }

  const row = await insertFont(db, {
    familyName: trimmedFamily,
    sourceName: input.sourceName,
    hash,
    cssKey,
    storageDriver: driver,
    chunkCount: sliced.chunkCount,
    totalBytes: sliced.totalBytes,
    etag,
  })
  return toAdminFontDto(row)
}
