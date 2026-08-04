import type { Env } from '@kobato/server/http/context'

import { adminSession, emptySession, regularSession } from '#/_helpers/session'

import { onErrorHandler } from '@kobato/server/http/errors'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The proxy route resolves upstream hostnames through safe-fetch's DNS
// guard — pin it to a public address so tests stay hermetic.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

function createTestApp(session = adminSession()) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { session, viewer: session.get('user') ?? null } as never)
    await next()
  })
  app.onError(onErrorHandler)
  return app
}

const ROUTES = [
  { route: 'cover', resolver: 'resolveCoverUrl', contentType: 'image/jpeg' },
  { route: 'audio', resolver: 'resolveAudioUrl', contentType: 'audio/mpeg' },
] as const

describe.each(ROUTES)('musicProxyRouter /admin/music/proxy/$route', ({ route, resolver, contentType }) => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('resolves the URL for a single track on request', async () => {
    const resolveUrl = vi.fn(async () => `https://up.example.com/${route}`)
    const getTrack = vi.fn(async () => ({
      source: 'netease',
      sourceId: '123',
      name: 'Song',
      artist: ['Artist'],
      album: 'Album',
      picId: 'pic123',
      urlId: 'url123',
      lyricId: 'lyric123',
    }))

    vi.doMock('@kobato/server/domains/music/providers/registry', () => ({
      getProvider: () => ({
        source: 'netease',
        getTrack,
        resolveCoverUrl: resolver === 'resolveCoverUrl' ? resolveUrl : vi.fn(),
        resolveAudioUrl: resolver === 'resolveAudioUrl' ? resolveUrl : vi.fn(),
      }),
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': contentType }),
        body: new ReadableStream(),
      })),
    )

    const { musicProxyRouter: router } = await import('@kobato/server/http/resources/music-proxy')
    const app = createTestApp(adminSession())
    app.route('/', router)

    const res = await app.request(`/admin/music/proxy/${route}?source=netease&sourceId=123`)
    expect(res.status).toBe(200)
    expect(getTrack).toHaveBeenCalledWith('123')
    expect(resolveUrl).toHaveBeenCalledTimes(1)
  })

  it('rejects an upstream URL pointing at an internal address without fetching it', async () => {
    const resolveUrl = vi.fn(async () => 'http://169.254.169.254/latest/meta-data')
    vi.doMock('@kobato/server/domains/music/providers/registry', () => ({
      getProvider: () => ({
        source: 'netease',
        getTrack: vi.fn(async () => ({
          source: 'netease',
          sourceId: '123',
          name: 'Song',
          artist: ['Artist'],
          album: 'Album',
          picId: 'pic123',
          urlId: 'url123',
          lyricId: 'lyric123',
        })),
        resolveCoverUrl: resolver === 'resolveCoverUrl' ? resolveUrl : vi.fn(),
        resolveAudioUrl: resolver === 'resolveAudioUrl' ? resolveUrl : vi.fn(),
      }),
    }))

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { musicProxyRouter: router } = await import('@kobato/server/http/resources/music-proxy')
    const app = createTestApp(adminSession())
    app.route('/', router)

    const res = await app.request(`/admin/music/proxy/${route}?source=netease&sourceId=123`)
    expect(res.status).toBe(502)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects anonymous callers with a 401 JSON error', async () => {
    const getProvider = vi.fn()
    vi.doMock('@kobato/server/domains/music/providers/registry', () => ({ getProvider }))

    const { musicProxyRouter: router } = await import('@kobato/server/http/resources/music-proxy')
    const app = createTestApp(emptySession())
    app.route('/', router)

    const res = await app.request(`/admin/music/proxy/${route}?source=netease&sourceId=123`)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { message: '未登录' } })
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('rejects under-privileged callers with a 403 JSON error', async () => {
    const getProvider = vi.fn()
    vi.doMock('@kobato/server/domains/music/providers/registry', () => ({ getProvider }))

    const { musicProxyRouter: router } = await import('@kobato/server/http/resources/music-proxy')
    const app = createTestApp(regularSession())
    app.route('/', router)

    const res = await app.request(`/admin/music/proxy/${route}?source=netease&sourceId=123`)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: { message: '权限不足' } })
    expect(getProvider).not.toHaveBeenCalled()
  })
})
