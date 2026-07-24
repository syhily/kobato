import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { Hono } from 'hono'

import type { MusicProvider, ProviderTrack } from '@/server/domains/music/providers/types'
import type { Env } from '@/server/http/context'
import type { MetingSource } from '@/shared/contracts/music'

import { getProvider } from '@/server/domains/music/providers/registry'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { ActionFailure } from '@/server/infra/http/errors'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const SOURCE_REFERERS: Record<MetingSource, string> = {
  netease: 'https://music.163.com/',
  tencent: 'https://y.qq.com/',
}

const VALID_SOURCES = new Set<string>(['netease', 'tencent'])

async function proxyUpstream(targetUrl: string, referer: string): Promise<Response> {
  const upstreamRes = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: referer,
    },
    signal: AbortSignal.timeout(30000),
  })

  if (!upstreamRes.ok) {
    return new Response(`Upstream returned ${upstreamRes.status}`, { status: upstreamRes.status })
  }

  const headers = new Headers()
  const contentType = upstreamRes.headers.get('content-type')
  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  headers.set('Cache-Control', 'private, max-age=300')

  return new Response(upstreamRes.body, { status: 200, headers })
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
    return new Response(JSON.stringify({ error: 'Missing source or sourceId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!VALID_SOURCES.has(source)) {
    return new Response(JSON.stringify({ error: 'Invalid source' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { source: unsafeCast<MetingSource>(source), sourceId }
}

function handleError(err: unknown) {
  const message = err instanceof ActionFailure ? err.message : 'Upstream error'
  const status = unsafeCast<ContentfulStatusCode>(err instanceof ActionFailure ? err.status : 502)
  return { error: message, status }
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
        return c.json({ error: 'Track not found' }, 404)
      }
      const url = await resolveUrl(provider, track)
      return await proxyUpstream(url, SOURCE_REFERERS[params.source])
    } catch (err: unknown) {
      const { error, status } = handleError(err)
      return c.json({ error }, status)
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
