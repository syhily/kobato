import type { MusicRow } from '@/server/infra/db/types'
import type { AdminMusicDto } from '@/shared/contracts/music'

import { resolveAssetUrl } from '@/server/infra/storage/public-url'

export function toAdminMusicDto(
  row: MusicRow & { uploaderName?: string | null },
  uploaderNameOverride?: string | null,
): AdminMusicDto {
  const uploaderName = uploaderNameOverride !== undefined ? uploaderNameOverride : (row.uploaderName ?? null)
  if (row.source !== 'netease' && row.source !== 'tencent') {
    throw new Error(`Unsupported music source: ${row.source}`)
  }
  return {
    id: row.id.toString(),
    source: row.source,
    sourceId: row.sourceId,
    playerId: row.playerId,
    name: row.name,
    artist: splitArtist(row.artist),
    album: row.album,
    audioStoragePath: row.audioStoragePath,
    audioUrl: resolveAssetUrl(row.audioStoragePath),
    coverStoragePath: row.coverStoragePath,
    coverUrl: resolveAssetUrl(row.coverStoragePath),
    lyric: row.lyric,
    uploaderId: row.uploaderId === null ? null : row.uploaderId.toString(),
    uploaderName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function splitArtist(packed: string): string[] {
  return packed
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}
