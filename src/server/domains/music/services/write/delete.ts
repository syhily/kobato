import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'

import { findMusicById, softDeleteMusic } from '@/server/infra/db/operations/music'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { backendFor } from '@/server/infra/storage/registry'

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
