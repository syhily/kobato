import type { AdminMusicDto, MetingSearchHit } from '@kobato/contracts/music.ts'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

export const SOURCE_OPTIONS: { value: string; labelId: UiMessageId }[] = [
  { value: 'netease', labelId: 'admin.musics.source.netease' },
  { value: 'tencent', labelId: 'admin.musics.source.tencent' },
]

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
