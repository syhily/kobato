import type { MusicProvider, ProviderSearchHit, ProviderTrack } from '@/server/domains/music/providers/types'

import { getCoverUrl, getLyric, getSong, getStreamUrl, searchSongsWithPreview } from '@/server/domains/music/netease'

export const neteaseProvider: MusicProvider = {
  source: 'netease',

  async search(keyword: string, limit: number): Promise<ProviderSearchHit[]> {
    return searchSongsWithPreview(keyword, limit)
  },

  async getTrack(sourceId: string): Promise<ProviderTrack | null> {
    const hit = await getSong(sourceId)
    if (hit === null) {
      return null
    }
    return {
      source: 'netease',
      sourceId: hit.sourceId,
      name: hit.name,
      artist: hit.artist,
      album: hit.album,
      picId: hit.picId,
      urlId: hit.urlId,
      lyricId: hit.lyricId,
    }
  },

  async resolveAudioUrl(track: ProviderTrack): Promise<string> {
    return getStreamUrl(track.urlId)
  },

  async resolveCoverUrl(track: ProviderTrack): Promise<string> {
    return getCoverUrl(track.picId)
  },

  async getLyric(track: ProviderTrack): Promise<string | null> {
    return getLyric(track.lyricId)
  },
}
