import type { Database } from '@kobato/db/database.ts'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac.ts'

import { findMusicById, softDeleteMusic } from '@kobato/db/operations/music.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError, ErrorMessages } from '@kobato/server/infra/http/errors.ts'
import { backendFor } from '@kobato/server/infra/storage/registry.ts'

export async function deleteMusic(db: Database, id: number, viewer?: ViewerIdentity): Promise<void> {
  const existing = await findMusicById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('music.error.notFound'))
  }
  if (viewer && viewer.role !== 'admin' && existing.uploaderId?.toString() !== viewer.id) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }

  // Best-effort storage delete, mirroring the image library — always proceed to the DB soft-delete.
  await Promise.allSettled([
    backendFor(existing.storageDriver).delete(existing.audioStoragePath),
    backendFor(existing.storageDriver).delete(existing.coverStoragePath),
  ])

  const deleted = await softDeleteMusic(db, id)
  if (deleted === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('music.error.notFound'))
  }
}
