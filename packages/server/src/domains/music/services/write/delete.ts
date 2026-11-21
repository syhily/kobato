import type { Database } from '@kobato/db/database'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'

import { findMusicById, softDeleteMusic } from '@kobato/db/operations/music'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError, ErrorMessages } from '@kobato/server/infra/http/errors'
import { backendFor } from '@kobato/server/infra/storage/registry'

export async function deleteMusic(db: Database, id: number, viewer?: ViewerIdentity): Promise<void> {
  const existing = await findMusicById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('music.error.notFound'))
  }
  if (viewer && viewer.role !== 'admin' && existing.uploaderId?.toString() !== viewer.id) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }

  await Promise.allSettled([
    backendFor(existing.storageDriver).delete(existing.audioStoragePath),
    backendFor(existing.storageDriver).delete(existing.coverStoragePath),
  ])

  const deleted = await softDeleteMusic(db, id)
  if (deleted === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('music.error.notFound'))
  }
}
