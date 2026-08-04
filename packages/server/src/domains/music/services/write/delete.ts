import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import type { Database } from '@kobato/server/infra/db/database'

import { findMusicById, softDeleteMusic } from '@kobato/server/infra/db/operations/music'
import { DomainError, ErrorMessages } from '@kobato/server/infra/http/errors'
import { backendFor } from '@kobato/server/infra/storage/registry'

export async function deleteMusic(db: Database, id: number, viewer?: ViewerIdentity): Promise<void> {
  const existing = await findMusicById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
  if (viewer && viewer.role !== 'admin' && existing.uploaderId?.toString() !== viewer.id) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }

  // Mirror the image library: try S3 best-effort, always proceed to
  // DB soft-delete so the admin table doesn't keep showing a "missing"
  // row when the delete only fails on the S3 leg.
  await Promise.allSettled([
    backendFor(existing.storageDriver).delete(existing.audioStoragePath),
    backendFor(existing.storageDriver).delete(existing.coverStoragePath),
  ])

  const deleted = await softDeleteMusic(db, id)
  if (deleted === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
}
