import type { AdminMusicDto, MetingSearchHit, MetingSource } from '@kobato/api/contracts/admin/music'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

export const SOURCE_OPTIONS = [
  { value: 'netease', labelId: 'admin.musics.source.netease' },
  { value: 'tencent', labelId: 'admin.musics.source.tencent' },
] as const satisfies readonly { value: MetingSource; labelId: UiMessageId }[]

export function hitToPreviewTrack(hit: MetingSearchHit): AdminMusicDto {
  return {
    id: `preview:${hit.sourceId}`,
    source: hit.source,
    sourceId: hit.sourceId,
    playerId: `preview:${hit.sourceId}`,
    name: hit.name,
    artist: hit.artist,
    album: hit.album,
    audioStoragePath: '',
    audioUrl: hit.previewUrl,
    coverStoragePath: '',
    coverUrl: hit.coverUrl,
    lyric: null,
    uploaderId: null,
    uploaderName: null,
    createdAt: '',
    updatedAt: '',
  }
}

export function isPreviewId(id: string | undefined): boolean {
  return id?.startsWith('preview:') ?? false
}
