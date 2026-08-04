import type { MetingSource, SearchMusicOutput } from '@kobato/shared/contracts/music'

import { getProvider } from '@kobato/server/domains/music/providers/registry'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

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
      source: unsafeCast<MetingSource>(hit.source),
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
