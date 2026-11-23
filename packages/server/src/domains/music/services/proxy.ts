import type { MetingSource } from '@kobato/api/contracts/admin/music'

import { getProvider } from '@kobato/server/domains/music/providers/registry'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { safeFetch } from '@kobato/server/infra/safe-fetch'

const SOURCE_REFERERS: Record<MetingSource, string> = {
  netease: 'https://music.163.com/',
  tencent: 'https://y.qq.com/',
}

const MAX_PROXY_BYTES = 50 * 1024 * 1024

export interface MusicProxyResult {
  body: ReadableStream<Uint8Array>
  contentType: string
  attachment: boolean
}

export async function proxyMusicAsset(
  source: MetingSource,
  sourceId: string,
  kind: 'cover' | 'audio',
): Promise<MusicProxyResult> {
  const provider = getProvider(source)
  const track = await provider.getTrack(sourceId)
  if (track === null) {
    throw new ActionFailure(404, descriptorFor('music.error.notFoundOrDeleted'))
  }
  const targetUrl = kind === 'cover' ? await provider.resolveCoverUrl(track) : await provider.resolveAudioUrl(track)
  const result = await safeFetch(targetUrl, {
    stream: true,
    timeoutMs: 30_000,
    maxBytes: MAX_PROXY_BYTES,
    operation: 'music.proxy',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: SOURCE_REFERERS[source],
    },
  })
  if (!result.ok) {
    const status = result.reason === 'http-error' && result.status !== null ? result.status : 502
    throw new ActionFailure(status, descriptorFor('music.error.upstreamUnavailable'))
  }
  if (result.response.body === null) {
    throw new ActionFailure(502, descriptorFor('music.error.upstreamUnavailable'))
  }
  const upstreamType = result.response.headers.get('content-type') ?? ''
  const playable = upstreamType.startsWith('image/') || upstreamType.startsWith('audio/')
  return {
    body: result.response.body,
    contentType: playable ? upstreamType : 'application/octet-stream',
    attachment: !playable,
  }
}
