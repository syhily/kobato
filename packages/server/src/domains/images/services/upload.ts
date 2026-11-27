import type { AdminImageDto, UploadKind } from '@kobato/api/contracts/admin/images'
import type { ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'
import type { Database } from '@kobato/db/sqlite/database'
import type { ImageRow } from '@kobato/db/sqlite/types'

import { formatBytes } from '@kobato/base/utils/format'
import {
  findImagesByStoragePaths,
  insertImage,
  upsertImageByStoragePath,
} from '@kobato/db/sqlite/operations/content/image'
import { type ImageKindSpec, buildObjectKey } from '@kobato/server/domains/images/key'
import { toAdminImageDto } from '@kobato/server/domains/images/services/admin-read'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { processImageBuffer } from '@kobato/server/infra/image/process'
import { getLogger } from '@kobato/server/infra/logger'
import { activeBackend } from '@kobato/server/infra/storage/registry'
import { resolveAppLocalization } from '@kobato/settings/app-localization'

const log = getLogger('images.service')

type ActiveBackend = ReturnType<typeof activeBackend>['backend']

async function deleteObjectUnlessClaimed(db: Database, backend: ActiveBackend, objectKey: string): Promise<void> {
  const claimed = await findImagesByStoragePaths(db, [objectKey]).catch(() => [] as ImageRow[])
  if (claimed.length === 0) {
    await Promise.allSettled([backend.delete(objectKey)])
  }
}

export interface UploadImageInputs {
  kind: UploadKind
  buffer: Buffer
  note?: string | null
  uploader: { id: number; name: string } | null
  maxBytes: number
  jpegQuality: number
}

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])

export type ImageUploadRejection = {
  code: 'BAD_REQUEST' | 'PAYLOAD_TOO_LARGE'
  descriptor: ErrorMessageDescriptor
}

export function checkImageUpload(file: { type: string; size: number }, maxBytes: number): ImageUploadRejection | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    return { code: 'BAD_REQUEST', descriptor: descriptorFor('images.error.unsupportedFormat') }
  }
  if (file.size > maxBytes) {
    return {
      code: 'PAYLOAD_TOO_LARGE',
      descriptor: descriptorFor('images.error.tooLarge', {
        max: formatBytes(maxBytes, { locale: resolveAppLocalization().locale }),
      }),
    }
  }
  return null
}

function getBufferMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
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
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif'
  }
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
    throw new DomainError(
      'BAD_REQUEST',
      descriptorFor('images.error.tooLarge', {
        max: formatBytes(input.maxBytes, { locale: resolveAppLocalization().locale }),
      }),
    )
  }

  if (!isValidImageBuffer(input.buffer)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('images.error.unsupportedFormat'))
  }

  const processed = await processImageBuffer(
    {
      buffer: input.buffer,
      jpegQuality: input.jpegQuality,
    },
    'images.upload',
  )

  if (processed.buffer.byteLength > input.maxBytes) {
    throw new DomainError(
      'BAD_REQUEST',
      descriptorFor('images.error.reencodedTooLarge', {
        max: formatBytes(input.maxBytes, { locale: resolveAppLocalization().locale }),
      }),
    )
  }

  const keySpec = toKeySpec(input.kind)
  const objectKey = buildObjectKey(keySpec)

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
      throw new DomainError('INTERNAL', descriptorFor('images.error.metadataWriteFailed'))
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
      throw new DomainError('INTERNAL', descriptorFor('images.error.metadataWriteFailed'))
    }
  }

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
