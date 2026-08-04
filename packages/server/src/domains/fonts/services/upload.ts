import type { Database } from '@kobato/server/infra/db/database'
import type { FontRow } from '@kobato/server/infra/db/schema/font'
import type { AdminFontDto } from '@kobato/shared/contracts/fonts'

import { findFontByHash, toAdminFontDto } from '@kobato/server/domains/fonts/services/read'
import { sliceFont } from '@kobato/server/domains/fonts/slice'
import { putFont, fontCssKey, type FontPackageFile } from '@kobato/server/domains/fonts/storage'
import { font } from '@kobato/server/infra/db/schema/font'
import { DomainError } from '@kobato/server/infra/http/errors'
import { createHash } from 'node:crypto'

// Upload pipeline: magic-byte validate → hash → dedupe → slice → store →
// insert. Synchronous within the request (several seconds for a CJK font);
// the UI shows a spinner and the row is only inserted on success, so there
// is no `processing`/`failed` state to track (per the design spec).

/** Max accepted upload size for a source TTF/OTF. Matches the Canvas font route. */
export const FONT_MAX_BYTES = 60 * 1024 * 1024 // 60 MiB

/**
 * Magic-byte validation. Mirrors the image/branding precedent: reject early
 * with a clean 400 rather than letting the slicer fail opaquely on a
 * non-font payload.
 *
 * - TTF: `00 01 00 00` (the sfVersion field of an OpenType/TrueType header).
 * - OTF: `OTTO` (4F 54 54 4F) — CFF-flavoured OpenType.
 * - WOFF/woff2 are rejected; cn-font-split can read them but the admin UI
 *   advertises TTF/OTF only, and accepting woff2-as-source would let an
 *   already-sliced package masquerade as a source font.
 */
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

/**
 * Validate that the font's table directory doesn't reference data beyond the
 * file boundary. A truncated font (e.g. incomplete download or copy) would
 * pass magic-byte detection but fail silently in the wasm core with 0 chunks
 * and an opaque "UnexpectedEof" warning.
 *
 * Throws `DomainError('BAD_REQUEST', …)` on the first out-of-bounds table.
 */
export function validateFontTableBounds(buffer: Uint8Array): void {
  if (buffer.length < 12) {
    throw new DomainError('BAD_REQUEST', '字体文件不完整：无法读取表目录')
  }
  const numTables = (buffer[4] << 8) | buffer[5]
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16
    if (off + 16 > buffer.length) {
      throw new DomainError('BAD_REQUEST', `字体文件不完整：表目录被截断（表 ${i + 1}/${numTables}）`)
    }
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3])
    const tableOffset = (buffer[off + 8] << 24) | (buffer[off + 9] << 16) | (buffer[off + 10] << 8) | buffer[off + 11]
    const tableLength = (buffer[off + 12] << 24) | (buffer[off + 13] << 16) | (buffer[off + 14] << 8) | buffer[off + 15]
    if (tableOffset + tableLength > buffer.length) {
      throw new DomainError(
        'BAD_REQUEST',
        `字体文件不完整：'${tag}' 表超出文件末尾（偏移 ${tableOffset.toLocaleString()} + 长度 ${tableLength.toLocaleString()} > 文件大小 ${buffer.length.toLocaleString()}），请使用完整的字体文件`,
      )
    }
  }
}

function sha256Hex(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export interface UploadFontInput {
  /** Source font bytes. */
  buffer: Uint8Array
  /** Original upload filename, recorded for audit. */
  sourceName: string
  /** CSS font-family name to inject into every @font-face rule. */
  familyName: string
}

/**
 * Upload + slice + store + insert a font. Idempotent on the source bytes:
 * if a font row with the same sha256 already exists, it is returned without
 * re-slicing or re-storing (the dedup fast path).
 */
export async function uploadFont(db: Database, input: UploadFontInput): Promise<AdminFontDto> {
  const { buffer, sourceName, familyName } = input

  const trimmedFamily = familyName.trim()
  if (trimmedFamily === '') {
    throw new DomainError('BAD_REQUEST', '字体名称不能为空')
  }
  if (buffer.length === 0) {
    throw new DomainError('BAD_REQUEST', '上传文件为空')
  }
  if (buffer.length > FONT_MAX_BYTES) {
    throw new DomainError('BAD_REQUEST', `字体体积超过上限（${FONT_MAX_BYTES} 字节）`)
  }
  if (!detectFontKind(buffer)) {
    throw new DomainError('BAD_REQUEST', '仅支持 .ttf 或 .otf 字体文件')
  }
  // Reject truncated fonts before we spend 15–20s in the wasm slicer.
  validateFontTableBounds(buffer)

  const hash = sha256Hex(buffer)

  // Dedup fast path: same source bytes → same row, no re-slice.
  const existing = await findFontByHash(db, hash)
  if (existing) {
    return toAdminFontDto(existing)
  }

  // Slice. Throws on a wasm contract drift or an internal core panic;
  // the controller maps that to a 500.
  const sliced = await sliceFont(Buffer.from(buffer), { fontFamily: trimmedFamily })

  // Persist css + every chunk under the content-addressed prefix.
  const files: FontPackageFile[] = [
    { name: 'result.css', body: Buffer.from(sliced.css), contentType: 'text/css; charset=utf-8' },
    ...sliced.chunks.map((c) => ({
      name: c.name,
      body: Buffer.from(c.data),
      contentType: 'font/woff2',
    })),
  ]
  const { driver } = await putFont(hash, files)

  // etag = sha256(result.css) so repackaging busts caches without changing
  // the storage key.
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
