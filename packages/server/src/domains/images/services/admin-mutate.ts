import type { AdminImageDto } from '@kobato/api/contracts/images'
import type { Database } from '@kobato/db/database'

import {
  findAdminImageRowById,
  findImageById,
  softDeleteImage,
  updateImageNoteWithUploader,
  updateImageThumbhashWithUploader,
} from '@kobato/db/operations/image'
import { canEditImage, type ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import { toAdminImageDto } from '@kobato/server/domains/images/services/admin-read'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError, ErrorMessages } from '@kobato/server/infra/http/errors'
import { processImageBuffer } from '@kobato/server/infra/image/process'
import { getLogger } from '@kobato/server/infra/logger'
import { StorageObjectNotFound } from '@kobato/server/infra/storage/backend'
import { backendFor } from '@kobato/server/infra/storage/registry'

const log = getLogger('images.service')

export type ImageViewerContext = ViewerIdentity

export async function deleteImage(db: Database, id: number, viewer?: ImageViewerContext): Promise<void> {
  const existing = await findImageById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('images.error.notFound'))
  }
  if (viewer && !canEditImage(viewer, existing)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }

  try {
    await backendFor(existing.storageDriver).delete(existing.storagePath)
  } catch (error) {
    log.warn('Storage delete failed; proceeding with DB soft-delete anyway', {
      id: String(id),
      storagePath: existing.storagePath,
      driver: existing.storageDriver,
      error,
    })
  }

  const deleted = await softDeleteImage(db, id)
  if (deleted === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('images.error.notFound'))
  }
}

export async function updateImageNote(
  db: Database,
  id: number,
  note: string | null,
  viewer?: ImageViewerContext,
): Promise<AdminImageDto> {
  const existing = await findImageById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('images.error.notFound'))
  }
  if (viewer && !canEditImage(viewer, existing)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  const updated = await updateImageNoteWithUploader(db, id, note)
  if (updated === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('images.error.notFound'))
  }
  return toAdminImageDto(updated, updated.uploaderName)
}

export async function recalculateImageThumbhash(
  db: Database,
  id: number,
  viewer?: ImageViewerContext,
): Promise<AdminImageDto> {
  const existing = await findAdminImageRowById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('images.error.notFound'))
  }
  if (viewer && !canEditImage(viewer, existing)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }

  let buffer: Buffer
  try {
    buffer = await backendFor(existing.storageDriver).get(existing.storagePath)
  } catch (error) {
    if (error instanceof StorageObjectNotFound) {
      throw new DomainError('NOT_FOUND', descriptorFor('images.error.objectMissing'))
    }
    const errorDetail =
      error instanceof Error ? { errorName: error.name, errorMessage: error.message } : { errorRaw: String(error) }
    log.error('Failed to fetch image from storage for thumbhash recalculation', {
      id: String(id),
      storagePath: existing.storagePath,
      driver: existing.storageDriver,
      ...errorDetail,
    })
    throw new DomainError('INTERNAL', descriptorFor('images.error.storageFetchFailed'))
  }

  const processed = await processImageBuffer(
    {
      buffer,
      jpegQuality: 82,
    },
    'images.mutate',
  )

  const updated = await updateImageThumbhashWithUploader(db, id, processed.thumbhash)
  if (updated === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('images.error.notFound'))
  }

  return toAdminImageDto(updated, updated.uploaderName)
}
