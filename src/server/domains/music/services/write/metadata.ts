import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { AdminMusicDto } from '@/shared/contracts/music'
import type { Role } from '@/shared/utils/roles'

import { toAdminMusicDto } from '@/server/domains/music/projection'
import { findAdminMusicRowById, findMusicById, updateMusic } from '@/server/infra/db/operations/music'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'

export interface UpdateMusicMetadataInputs {
  id: bigint
  name: string
  artist: string[]
  album: string
  /** `null` clears the stored lyric (matches the "no upstream lyric" case). */
  lyric: string | null
}

export interface MusicViewerContext {
  userId: string
  role: Role
}

/**
 * Metadata-only edit for the admin UI. Provider id triplet
 * (`source`, `sourceId`, `playerId`), audio/cover storage paths,
 * uploader, and timestamps are intentionally untouched — the
 * upload pipeline owns those, and `playerId` is how `musicPlayer`
 * PortableText blocks reference the row. `artist[]` is packed back to the historical
 * `'Artist A / Artist B'` row representation; the public
 * projection unpacks it again on read.
 */
export async function updateMusicMetadata(
  db: NodePgDatabase,
  input: UpdateMusicMetadataInputs,
  viewer?: MusicViewerContext,
): Promise<AdminMusicDto> {
  const existing = await findMusicById(db, input.id)
  if (existing === null || existing.deletedAt !== null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
  if (viewer && viewer.role !== 'admin' && existing.uploaderId?.toString() !== viewer.userId) {
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

  // Re-fetch through the admin projection so the response carries
  // the joined `uploaderName` instead of forcing the caller to
  // re-derive it.
  const projected = await findAdminMusicRowById(db, input.id)
  if (projected === null) {
    throw new DomainError('NOT_FOUND', '音乐不存在')
  }
  return toAdminMusicDto(projected, projected.uploaderName)
}
