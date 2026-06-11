/* oxlint-disable typescript/no-unsafe-type-assertion */

import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { Hono } from 'hono'

import type { Env } from '@/server/http/context'
import type { MetingSource } from '@/shared/types/music'

import { getProvider } from '@/server/domains/music/providers/registry'
import { ActionFailure } from '@/server/infra/http/errors'
import { hasAtLeast } from '@/shared/utils/roles'

const SOURCE_REFERERS: Record<MetingSource, string> = {
  netease: 'https://music.163.com/',
  tencent: 'https://y.qq.com/',
}

const VALID_SOURCES = new Set<string>(['netease', 'tencent'])

function requireAuthor(c: { var: Env['Variables'] }): Response | null {
  const viewer = c.var.viewer
  if (!viewer || !hasAtLeast(viewer.role, 'author')) {
    return new Response('Unauthorized', { status: 401 })
  }
  return null
}

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
  return { source: source as MetingSource, sourceId }
}

function handleError(err: unknown) {
  const message = err instanceof ActionFailure ? err.message : 'Upstream error'
  const status = (err instanceof ActionFailure ? err.status : 502) as ContentfulStatusCode
  return { error: message, status }
}

export const musicProxyRouter = new Hono<Env>()

musicProxyRouter.get('/admin/music/proxy/cover', async (c) => {
  const authError = requireAuthor(c)
  if (authError) {
    return authError
  }

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
    const coverUrl = await provider.resolveCoverUrl(track)
    return await proxyUpstream(coverUrl, SOURCE_REFERERS[params.source])
  } catch (err: unknown) {
    const { error, status } = handleError(err)
    return c.json({ error }, status)
  }
})

musicProxyRouter.get('/admin/music/proxy/audio', async (c) => {
  const authError = requireAuthor(c)
  if (authError) {
    return authError
  }

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
    const audioUrl = await provider.resolveAudioUrl(track)
    return await proxyUpstream(audioUrl, SOURCE_REFERERS[params.source])
  } catch (err: unknown) {
    const { error, status } = handleError(err)
    return c.json({ error }, status)
  }
})
