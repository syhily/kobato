import type { SearchMusicOutput } from '@/shared/types/music'

import { searchSongsWithPreview } from '@/server/domains/music/meting'

export async function searchMusic(keyword: string, limit?: number): Promise<SearchMusicOutput> {
  const hits = await searchSongsWithPreview(keyword, limit)
  return {
    results: hits.map((hit) => ({
      source: hit.source,
      sourceId: hit.sourceId,
      name: hit.name,
      artist: hit.artist,
      album: hit.album,
      coverUrl: hit.coverUrl,
      previewUrl: hit.previewUrl,
    })),
  }
}
