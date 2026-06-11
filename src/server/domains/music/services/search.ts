import type { MetingSource, SearchMusicOutput } from '@/shared/types/music'

import { getProvider } from '@/server/domains/music/providers/registry'

function toProxyCoverUrl(source: MetingSource, sourceId: string): string {
  return `/admin/music/proxy/cover?source=${source}&sourceId=${encodeURIComponent(sourceId)}`
}

function toProxyAudioUrl(source: MetingSource, sourceId: string): string {
  return `/admin/music/proxy/audio?source=${source}&sourceId=${encodeURIComponent(sourceId)}`
}

export async function searchMusic(
  source: MetingSource,
  keyword: string,
  limit?: number,
  offset?: number,
): Promise<SearchMusicOutput> {
  const provider = getProvider(source)
  const safeLimit = limit ?? 10
  const { hits, hasMore } = await provider.search(keyword, safeLimit, offset ?? 0)
  return {
    results: hits.map((hit) => ({
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      source: hit.source as MetingSource,
      sourceId: hit.sourceId,
      name: hit.name,
      artist: hit.artist,
      album: hit.album,
      coverUrl: toProxyCoverUrl(source, hit.sourceId),
      previewUrl: toProxyAudioUrl(source, hit.sourceId),
    })),
    hasMore,
  }
}
