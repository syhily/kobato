import type { MusicProvider } from '@kobato/server/domains/music/providers/types.ts'
import type { Env } from '@kobato/server/http/hono-env.ts'

import { __setProviderForTests } from '@kobato/server/domains/music/providers/registry.ts'
import { onErrorHandler } from '@kobato/server/http/errors.ts'
import { __setDnsLookupForTests } from '@kobato/server/infra/safe-fetch.ts'
import { adminSession, emptySession, regularSession } from '@kobato/server/tests/utils/session.ts'
import { Hono } from 'hono'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const search = vi.fn<MusicProvider['search']>()
const getTrack = vi.fn<MusicProvider['getTrack']>()
const getLyric = vi.fn<MusicProvider['getLyric']>()
const resolveCoverUrl = vi.fn<MusicProvider['resolveCoverUrl']>()
const resolveAudioUrl = vi.fn<MusicProvider['resolveAudioUrl']>()

const fakeProvider: MusicProvider = {
  source: 'netease',
  search,
  getTrack,
  getLyric,
  resolveCoverUrl,
  resolveAudioUrl,
}

__setProviderForTests('netease', fakeProvider)

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
  { route: 'cover', contentType: 'image/jpeg' },
  { route: 'audio', contentType: 'audio/mpeg' },
] as const

beforeAll(() => {
  __setDnsLookupForTests(async () => [{ address: '203.0.113.10', family: 4 }])
})

afterAll(() => {
  __setDnsLookupForTests(null)
  __setProviderForTests('netease', null)
})

describe.each(ROUTES)('musicProxyRouter /admin/music/proxy/$route', ({ route, contentType }) => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    getTrack.mockClear()
    resolveCoverUrl.mockClear()
    resolveAudioUrl.mockClear()
    getTrack.mockResolvedValue({
      source: 'netease',
      sourceId: '123',
      name: 'Song',
      artist: ['Artist'],
      album: 'Album',
      picId: 'pic123',
      urlId: 'url123',
      lyricId: 'lyric123',
    } as Awaited<ReturnType<MusicProvider['getTrack']>>)
  })

  it('resolves the URL for a single track on request', async () => {
    const resolveUrl = route === 'cover' ? resolveCoverUrl : resolveAudioUrl
    resolveUrl.mockResolvedValueOnce(`https://up.example.com/${route}` as never)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': contentType }),
        body: new ReadableStream(),
      })),
    )

    const { musicProxyRouter: router } = await import('@kobato/server/http/resources/music-proxy.ts')
    const app = createTestApp(adminSession())
    app.route('/', router)

    const res = await app.request(`/admin/music/proxy/${route}?source=netease&sourceId=123`)
    expect(res.status).toBe(200)
    expect(getTrack).toHaveBeenCalledWith('123')
    expect(resolveUrl).toHaveBeenCalledTimes(1)
  })

  it('rejects an upstream URL pointing at an internal address without fetching it', async () => {
    const resolveUrl = route === 'cover' ? resolveCoverUrl : resolveAudioUrl
    resolveUrl.mockResolvedValueOnce('http://169.254.169.254/latest/meta-data' as never)

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { musicProxyRouter: router } = await import('@kobato/server/http/resources/music-proxy.ts')
    const app = createTestApp(adminSession())
    app.route('/', router)

    const res = await app.request(`/admin/music/proxy/${route}?source=netease&sourceId=123`)
    expect(res.status).toBe(502)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('serves an unexpected upstream content type as an opaque download', async () => {
    const resolveUrl = route === 'cover' ? resolveCoverUrl : resolveAudioUrl
    resolveUrl.mockResolvedValueOnce(`https://up.example.com/${route}` as never)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        body: new ReadableStream(),
      })),
    )

    const { musicProxyRouter: router } = await import('@kobato/server/http/resources/music-proxy.ts')
    const app = createTestApp(adminSession())
    app.route('/', router)

    const res = await app.request(`/admin/music/proxy/${route}?source=netease&sourceId=123`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-disposition')).toBe('attachment')
  })

  it('rejects anonymous callers with a 401 JSON error', async () => {
    const { musicProxyRouter: router } = await import('@kobato/server/http/resources/music-proxy.ts')
    const app = createTestApp(emptySession())
    app.route('/', router)

    const res = await app.request(`/admin/music/proxy/${route}?source=netease&sourceId=123`)
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
        message: '需要登录后再操作。',
        descriptor: { messageKey: 'error.api.unauthorized' },
      },
    })
    expect(getTrack).not.toHaveBeenCalled()
  })

  it('rejects under-privileged callers with a 403 JSON error', async () => {
    const { musicProxyRouter: router } = await import('@kobato/server/http/resources/music-proxy.ts')
    const app = createTestApp(regularSession())
    app.route('/', router)

    const res = await app.request(`/admin/music/proxy/${route}?source=netease&sourceId=123`)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN',
        message: '权限不足',
        descriptor: { messageKey: 'error.api.insufficientPermissions' },
      },
    })
    expect(getTrack).not.toHaveBeenCalled()
  })
})
