import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'
import type { AdminMusicDto } from '@/shared/contracts/music'

import { toAdminMusicDto } from '@/server/domains/music/projection'
import { findAdminMusicRowById, findMusicById, updateMusic } from '@/server/infra/db/operations/music'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'

export interface UpdateMusicMetadataInputs {
  id: number
  name: string
  artist: string[]
  album: string
  /** `null` clears the stored lyric. */
  lyric: string | null
}

/**
 * Metadata-only edit for the admin UI; `artist[]` is packed to the
 * `'Artist A / Artist B'` row form. Other columns are upload-pipeline-owned.
 */
export async function updateMusicMetadata(
  db: Database,
  input: UpdateMusicMetadataInputs,
  viewer?: ViewerIdentity,
): Promise<AdminMusicDto> {
  const existing = await findMusicById(db, input.id)
  if (existing?.deletedAt !== null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
  if (viewer && viewer.role !== 'admin' && existing.uploaderId?.toString() !== viewer.id) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }

  const updated = await updateMusic(db, input.id, {
    name: input.name,
    artist: input.artist.join(' / '),
    album: input.album,
    lyric: input.lyric,
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }

  // Re-fetch so the response carries the joined `uploaderName`.
  const projected = await findAdminMusicRowById(db, input.id)
  if (projected === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
  return toAdminMusicDto(projected, projected.uploaderName)
}
