/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { MetingSource, SearchMusicOutput } from '@/shared/types/music'

import { getProvider } from '@/server/domains/music/providers/registry'

export async function searchMusic(source: string, keyword: string, limit?: number): Promise<SearchMusicOutput> {
  const provider = getProvider(source)
  const hits = await provider.search(keyword, limit ?? 10)
  return {
    results: hits.map((hit) => ({
      source: hit.source as MetingSource,
      sourceId: hit.sourceId,
      name: hit.name,
      artist: hit.artist,
      album: hit.album,
      coverUrl: hit.coverUrl,
      previewUrl: hit.previewUrl,
    })),
  }
}
