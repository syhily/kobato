import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { MusicViewerContext } from '@/server/domains/music/services/write/metadata'

import { findMusicById, softDeleteMusic } from '@/server/infra/db/operations/music'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { backendFor } from '@/server/infra/storage/registry'

export async function deleteMusic(db: NodePgDatabase, id: bigint, viewer?: MusicViewerContext): Promise<void> {
  const existing = await findMusicById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
  if (viewer && viewer.role !== 'admin' && existing.uploaderId?.toString() !== viewer.userId) {
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
