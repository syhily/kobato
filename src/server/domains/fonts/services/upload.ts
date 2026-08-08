import { createHash } from 'node:crypto'

import type { Database } from '@/server/infra/db/database'
import type { FontRow } from '@/server/infra/db/schema/font'
import type { AdminFontDto } from '@/shared/contracts/fonts'

import { findFontByHash, toAdminFontDto } from '@/server/domains/fonts/services/read'
import { sliceFont } from '@/server/domains/fonts/slice'
import { putFont, fontCssKey, type FontPackageFile } from '@/server/domains/fonts/storage'
import { font } from '@/server/infra/db/schema/font'
import { DomainError } from '@/server/infra/http/errors'

// Upload pipeline: magic-byte validate → hash → dedupe → slice → store →
// insert. Synchronous within the request; rows only exist once inserted,
// so there is no `processing`/`failed` state.

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

/** Reject fonts whose table directory references data beyond EOF. Throws `DomainError('BAD_REQUEST', …)`. */
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
  buffer: Uint8Array
  /** Original upload filename, recorded for audit. */
  sourceName: string
  /** CSS font-family name to inject into every @font-face rule. */
  familyName: string
}

/** Upload + slice + store + insert. Idempotent on source bytes — same sha256 returns the existing row. */
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
  validateFontTableBounds(buffer)

  const hash = sha256Hex(buffer)

  const existing = await findFontByHash(db, hash)
  if (existing) {
    return toAdminFontDto(existing)
  }

  // Throws on wasm contract drift or core panic; the controller maps it to a 500.
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
