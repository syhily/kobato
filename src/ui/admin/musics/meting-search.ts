import type { AdminMusicDto, MetingSearchHit } from '@/shared/contracts/music'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

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
