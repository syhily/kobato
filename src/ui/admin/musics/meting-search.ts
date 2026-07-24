import type { AdminMusicDto, MetingSearchHit } from '@/shared/contracts/music'

export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'netease', label: '网易云' },
  { value: 'tencent', label: 'QQ音乐' },
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
  return id !== undefined && id.startsWith('preview:')
}
