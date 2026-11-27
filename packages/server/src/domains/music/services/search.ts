import type { MetingSource, SearchMusicOutput } from '@kobato/api/contracts/admin/music'

import { serializeKobatoRpcQueryInput } from '@kobato/api/client/rpc-serialization'
import { ADMIN_MUSIC_PROXY_AUDIO_RPC_PATH, ADMIN_MUSIC_PROXY_COVER_RPC_PATH } from '@kobato/api/rpc/admin/music'
import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { getProvider } from '@kobato/server/domains/music/providers/registry'

function proxyUrl(path: string, source: MetingSource, sourceId: string): string {
  const data = encodeURIComponent(serializeKobatoRpcQueryInput({ source, sourceId }))
  return `${path}?data=${data}`
}

function toProxyCoverUrl(source: MetingSource, sourceId: string): string {
  return proxyUrl(ADMIN_MUSIC_PROXY_COVER_RPC_PATH, source, sourceId)
}

function toProxyAudioUrl(source: MetingSource, sourceId: string): string {
  return proxyUrl(ADMIN_MUSIC_PROXY_AUDIO_RPC_PATH, source, sourceId)
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
