import type { AdminMusicDto } from '@kobato/contracts/music'
import type { Database } from '@kobato/db/database'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'

import { findAdminMusicRowById, findMusicById, updateMusic } from '@kobato/db/operations/music'
import { toAdminMusicDto } from '@kobato/server/domains/music/projection'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError, ErrorMessages } from '@kobato/server/infra/http/errors'

export interface UpdateMusicMetadataInputs {
  id: number
  name: string
  artist: string[]
  album: string
  lyric: string | null
}

export async function updateMusicMetadata(
  db: Database,
  input: UpdateMusicMetadataInputs,
  viewer?: ViewerIdentity,
): Promise<AdminMusicDto> {
  const existing = await findMusicById(db, input.id)
  if (existing?.deletedAt !== null) {
    throw new DomainError('NOT_FOUND', descriptorFor('music.error.notFound'))
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
    throw new DomainError('NOT_FOUND', descriptorFor('music.error.notFound'))
  }

  const projected = await findAdminMusicRowById(db, input.id)
  if (projected === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('music.error.notFound'))
  }
  return toAdminMusicDto(projected, projected.uploaderName)
}
