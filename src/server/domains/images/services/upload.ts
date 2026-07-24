import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ImageRow } from '@/server/infra/db/types'
import type { AdminImageDto } from '@/shared/contracts/images'

import { type ImageKindSpec, buildObjectKey } from '@/server/domains/images/key'
import { toAdminImageDto } from '@/server/domains/images/services/admin-read'
import { invalidateImageEnhanceCacheFor } from '@/server/domains/images/services/cache'
import { putImage } from '@/server/domains/images/storage'
import { insertImage, upsertImageByStoragePath } from '@/server/infra/db/operations/image'
import { DomainError } from '@/server/infra/http/errors'
import { processImageBuffer } from '@/server/infra/image/process'
import { getLogger } from '@/server/infra/logger'
import { formatBytes } from '@/shared/utils/formatter'

const log = getLogger('images.service')

export type UploadKind = { kind: 'generic' } | { kind: 'category'; slug: string } | { kind: 'friend'; host: string }

export interface UploadImageInputs {
  kind: UploadKind
  buffer: Buffer
  note?: string | null
  uploader: { id: bigint; name: string } | null
  maxBytes: number
  jpegQuality: number
}

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])

function getBufferMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif'
  }
  // WebP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp'
  }
  // AVIF
  const ftypIndex = buffer.indexOf(Buffer.from('ftyp'))
  if (ftypIndex !== -1 && ftypIndex + 4 < buffer.length) {
    const brand = buffer.toString('ascii', ftypIndex + 4, ftypIndex + 8)
    if (brand === 'avif' || brand === 'avis') {
      return 'image/avif'
    }
  }
  return null
}

function isValidImageBuffer(buffer: Buffer): boolean {
  const mime = getBufferMimeType(buffer)
  return mime !== null && ALLOWED_IMAGE_MIME_TYPES.has(mime)
}

export async function uploadImage(db: NodePgDatabase, input: UploadImageInputs): Promise<AdminImageDto> {
  if (input.buffer.byteLength > input.maxBytes) {
    throw new DomainError('BAD_REQUEST', `图片体积超过上限（${formatBytes(input.maxBytes)}）`)
  }

  if (!isValidImageBuffer(input.buffer)) {
    throw new DomainError('BAD_REQUEST', '不支持的图片格式，请上传 JPEG、PNG、WebP、AVIF 或 GIF 格式的图片')
  }

  const processed = await processImageBuffer({
    buffer: input.buffer,
    jpegQuality: input.jpegQuality,
  })

  if (processed.buffer.byteLength > input.maxBytes) {
    throw new DomainError('BAD_REQUEST', `重编码后体积超过上限（${formatBytes(input.maxBytes)}）`)
  }

  const keySpec = toKeySpec(input.kind)
  const objectKey = buildObjectKey(keySpec)

  const { driver } = await putImage({
    storagePath: objectKey,
    body: processed.buffer,
    contentType: 'image/jpeg',
  })

  const trimmedNote = input.note?.trim() ?? ''
  const noteValue = trimmedNote === '' ? null : trimmedNote

  let row: ImageRow
  if (input.kind.kind === 'generic') {
    try {
      row = await insertImage(db, {
        storagePath: objectKey,
        storageDriver: driver,
        mimeType: 'image/jpeg',
        width: processed.width,
        height: processed.height,
        byteSize: processed.byteSize,
        thumbhash: processed.thumbhash,
        uploaderId: input.uploader?.id ?? null,
        note: noteValue,
      })
    } catch (error) {
      log.error('Generic image insert failed (storage_path collision?)', { objectKey, driver, error })
      throw new DomainError('INTERNAL', '图片元数据写入失败，请稍后重试')
    }
  } else {
    row = await upsertImageByStoragePath(db, {
      storagePath: objectKey,
      storageDriver: driver,
      mimeType: 'image/jpeg',
      width: processed.width,
      height: processed.height,
      byteSize: processed.byteSize,
      thumbhash: processed.thumbhash,
      uploaderId: input.uploader?.id ?? null,
      note: noteValue,
    })
  }

  await invalidateImageEnhanceCacheFor(row.storagePath)

  return toAdminImageDto(row, input.uploader?.name ?? null)
}

function toKeySpec(kind: UploadKind): ImageKindSpec {
  switch (kind.kind) {
    case 'generic':
      return { kind: 'generic', now: new Date() }
    case 'category':
      return { kind: 'category', slug: kind.slug }
    case 'friend':
      return { kind: 'friend', host: kind.host }
  }
}
