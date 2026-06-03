import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ImageRow } from '@/server/infra/db/types'
import type { AdminImageDto } from '@/shared/types/images'

import { type ImageKindSpec, buildObjectKey } from '@/server/domains/images/key'
import { processImageBuffer } from '@/server/domains/images/process'
import { toAdminImageDto } from '@/server/domains/images/services/admin-read'
import { invalidateImageEnhanceCacheFor } from '@/server/domains/images/services/cache'
import { putImage } from '@/server/domains/images/storage'
import { insertImage, upsertImageByStoragePath } from '@/server/infra/db/operations/image'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

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

export async function uploadImage(db: NodePgDatabase, input: UploadImageInputs): Promise<AdminImageDto> {
  if (input.buffer.byteLength > input.maxBytes) {
    throw new DomainError('BAD_REQUEST', `图片体积超过上限（${formatBytes(input.maxBytes)}）`)
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

  await putImage({
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
        mimeType: 'image/jpeg',
        width: processed.width,
        height: processed.height,
        byteSize: processed.byteSize,
        thumbhash: processed.thumbhash,
        uploaderId: input.uploader?.id ?? null,
        note: noteValue,
      })
    } catch (error) {
      log.error('Generic image insert failed (storage_path collision?)', { objectKey, error })
      throw new DomainError('INTERNAL', '图片元数据写入失败，请稍后重试')
    }
  } else {
    row = await upsertImageByStoragePath(db, {
      storagePath: objectKey,
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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${bytes} B`
}
