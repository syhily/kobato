import { ORPCError } from '@orpc/server'

import type { Database } from '@/server/infra/db/database'
import type { ImageRow } from '@/server/infra/db/types'
import type { AdminImageDto } from '@/shared/contracts/images'

import { type ImageKindSpec, buildObjectKey } from '@/server/domains/images/key'
import { toAdminImageDto } from '@/server/domains/images/services/admin-read'
import { invalidateImageEnhanceCacheFor } from '@/server/domains/images/services/cache'
import { findImagesByStoragePaths, insertImage, upsertImageByStoragePath } from '@/server/infra/db/operations/image'
import { DomainError } from '@/server/infra/http/errors'
import { processImageBuffer } from '@/server/infra/image/process'
import { getLogger } from '@/server/infra/logger'
import { activeBackend } from '@/server/infra/storage/registry'
import { formatBytes } from '@/shared/utils/formatter'

const log = getLogger('images.service')

type ActiveBackend = ReturnType<typeof activeBackend>['backend']

// Only delete when no row claims the key — a raced upload may own it.
async function deleteObjectUnlessClaimed(db: Database, backend: ActiveBackend, objectKey: string): Promise<void> {
  const claimed = await findImagesByStoragePaths(db, [objectKey]).catch(() => [] as ImageRow[])
  if (claimed.length === 0) {
    await Promise.allSettled([backend.delete(objectKey)])
  }
}

export type UploadKind = { kind: 'generic' } | { kind: 'category'; slug: string } | { kind: 'friend'; host: string }

export interface UploadImageInputs {
  kind: UploadKind
  buffer: Buffer
  note?: string | null
  uploader: { id: number; name: string } | null
  maxBytes: number
  jpegQuality: number
}

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])

/**
 * Pre-read check of the declared envelope; authoritative checks still
 * run in {@link uploadImage}. Messages are the wire contract — do not reword.
 */
export function assertImageUploadAllowed(file: { type: string; size: number }, maxBytes: number): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new ORPCError('BAD_REQUEST', {
      message: '不支持的图片格式，请上传 JPEG、PNG、WebP、AVIF 或 GIF 格式的图片',
    })
  }
  if (file.size > maxBytes) {
    throw new ORPCError('PAYLOAD_TOO_LARGE', {
      message: `图片体积超过上限（${formatBytes(maxBytes)}）`,
    })
  }
}

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

export async function uploadImage(db: Database, input: UploadImageInputs): Promise<AdminImageDto> {
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

  // Driver is persisted on the row so reads/deletes dispatch on it later.
  const { backend, driver } = activeBackend()
  await backend.put({ key: objectKey, body: processed.buffer, contentType: 'image/jpeg', visibility: 'public' })

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
      log.error('Generic image insert failed (storage_path collision?); rolling back upload', {
        objectKey,
        driver,
        error,
      })
      await deleteObjectUnlessClaimed(db, backend, objectKey)
      throw new DomainError('INTERNAL', '图片元数据写入失败，请稍后重试')
    }
  } else {
    try {
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
    } catch (error) {
      log.error('Image upsert failed; rolling back upload', { objectKey, driver, kind: input.kind.kind, error })
      await deleteObjectUnlessClaimed(db, backend, objectKey)
      throw new DomainError('INTERNAL', '图片元数据写入失败，请稍后重试')
    }
  }

  await invalidateImageEnhanceCacheFor(db, row.storagePath)

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
