import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { getProvider } from '@/server/domains/music/providers/registry'
import { hasAtLeast } from '@/shared/utils/roles'

function requireAuthor(c: { var: Env['Variables'] }): Response | null {
  const viewer = c.var.viewer
  if (!viewer || !hasAtLeast(viewer.role, 'author')) {
    return new Response('Unauthorized', { status: 401 })
  }
  return null
}

async function proxyUpstream(targetUrl: string): Promise<Response> {
  const upstreamRes = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://y.qq.com/',
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
  // Allow short-term caching for previews to reduce redundant upstream hits.
  headers.set('Cache-Control', 'private, max-age=300')

  return new Response(upstreamRes.body, { status: 200, headers })
}

export const musicProxyRouter = new Hono<Env>()

musicProxyRouter.get('/admin/music/proxy/cover', async (c) => {
  const authError = requireAuthor(c)
  if (authError) {
    return authError
  }

  const source = c.req.query('source')
  const sourceId = c.req.query('sourceId')
  if (!source || !sourceId) {
    return c.json({ error: 'Missing source or sourceId parameter' }, 400)
  }

  if (source !== 'netease' && source !== 'tencent') {
    return c.json({ error: 'Invalid source' }, 400)
  }

  const provider = getProvider(source)
  const track = await provider.getTrack(sourceId)
  if (track === null) {
    return c.json({ error: 'Track not found' }, 404)
  }

  const coverUrl = await provider.resolveCoverUrl(track)
  return proxyUpstream(coverUrl)
})

musicProxyRouter.get('/admin/music/proxy/audio', async (c) => {
  const authError = requireAuthor(c)
  if (authError) {
    return authError
  }

  const source = c.req.query('source')
  const sourceId = c.req.query('sourceId')
  if (!source || !sourceId) {
    return c.json({ error: 'Missing source or sourceId parameter' }, 400)
  }

  if (source !== 'netease' && source !== 'tencent') {
    return c.json({ error: 'Invalid source' }, 400)
  }

  const provider = getProvider(source)
  const track = await provider.getTrack(sourceId)
  if (track === null) {
    return c.json({ error: 'Track not found' }, 404)
  }

  const audioUrl = await provider.resolveAudioUrl(track)
  return proxyUpstream(audioUrl)
})
