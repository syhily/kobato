import type { MusicProvider, ProviderTrack } from '@kobato/server/domains/music/providers/types'
import type { Env } from '@kobato/server/http/context'
import type { MetingSource } from '@kobato/shared/contracts/music'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { getProvider } from '@kobato/server/domains/music/providers/registry'
import { requireRoleMw } from '@kobato/server/http/middlewares/hono-rbac'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { safeFetch } from '@kobato/server/infra/safe-fetch'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { Hono } from 'hono'

const SOURCE_REFERERS: Record<MetingSource, string> = {
  netease: 'https://music.163.com/',
  tencent: 'https://y.qq.com/',
}

const VALID_SOURCES = new Set<string>(['netease', 'tencent'])

/** Upstream payload cap: a proxied track/cover never exceeds 50 MB. */
const MAX_PROXY_BYTES = 50 * 1024 * 1024

async function proxyUpstream(targetUrl: string, referer: string): Promise<Response> {
  // The target URL comes from the upstream provider API (schema-checked
  // only as a string) — route it through the SSRF-guarded fetch so a
  // hostile/compromised upstream cannot point the proxy at internal
  // addresses, and cap the streamed body.
  const result = await safeFetch(targetUrl, {
    stream: true,
    timeoutMs: 30000,
    maxBytes: MAX_PROXY_BYTES,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: referer,
    },
  })

  if (!result.ok) {
    if (result.reason === 'http-error' && result.status !== null) {
      return new Response(`Upstream returned ${result.status}`, { status: result.status })
    }
    return new Response(`Upstream error: ${result.reason}`, { status: 502 })
  }

  const headers = new Headers()
  const contentType = result.response.headers.get('content-type')
  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  headers.set('Cache-Control', 'private, max-age=300')

  return new Response(result.response.body, { status: 200, headers })
}

function parseProxyParams(c: { req: { query: (k: string) => string | undefined } }):
  | {
      source: MetingSource
      sourceId: string
    }
  | Response {
  const source = c.req.query('source')
  const sourceId = c.req.query('sourceId')
  if (!source || !sourceId) {
    return new Response(JSON.stringify({ error: { message: 'Missing source or sourceId parameter' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!VALID_SOURCES.has(source)) {
    return new Response(JSON.stringify({ error: { message: 'Invalid source' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { source: unsafeCast<MetingSource>(source), sourceId }
}

function handleError(err: unknown) {
  const message = err instanceof ActionFailure ? err.message : 'Upstream error'
  const status = unsafeCast<ContentfulStatusCode>(err instanceof ActionFailure ? err.status : 502)
  return { message, status }
}

function proxyHandler(resolveUrl: (provider: MusicProvider, track: ProviderTrack) => Promise<string>) {
  return async (c: Context<Env>) => {
    const params = parseProxyParams(c)
    if (params instanceof Response) {
      return params
    }

    const provider = getProvider(params.source)
    try {
      const track = await provider.getTrack(params.sourceId)
      if (track === null) {
        return c.json({ error: { message: 'Track not found' } }, 404)
      }
      const url = await resolveUrl(provider, track)
      return await proxyUpstream(url, SOURCE_REFERERS[params.source])
    } catch (err: unknown) {
      const { message, status } = handleError(err)
      return c.json({ error: { message } }, status)
    }
  }
}

export const musicProxyRouter = new Hono<Env>()

musicProxyRouter.use('/admin/music/proxy/*', requireRoleMw('author'))

musicProxyRouter.get(
  '/admin/music/proxy/cover',
  proxyHandler((p, t) => p.resolveCoverUrl(t)),
)
musicProxyRouter.get(
  '/admin/music/proxy/audio',
  proxyHandler((p, t) => p.resolveAudioUrl(t)),
)
