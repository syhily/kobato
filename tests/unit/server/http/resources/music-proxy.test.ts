import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function createTestApp(viewer: { role: string } | null) {
  const app = new Hono()
  app.use('/admin/music/proxy/*', async (c, next) => {
    c.set('viewer' as never, viewer as never)
    await next()
  })
  return app
}

describe('musicProxyRouter cover preview', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('resolves the cover URL for a single track on request', async () => {
    const resolveCoverUrl = vi.fn(async () => 'https://up.example.com/cover.jpg')
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

    vi.doMock('@/server/domains/music/providers/registry', () => ({
      getProvider: () => ({
        source: 'netease',
        getTrack,
        resolveCoverUrl,
        resolveAudioUrl: vi.fn(),
      }),
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        body: new ReadableStream(),
      })),
    )

    const { musicProxyRouter: router } = await import('@/server/http/resources/music-proxy')
    const app = createTestApp({ role: 'admin' })
    app.route('/', router)

    const res = await app.request('/admin/music/proxy/cover?source=netease&sourceId=123')
    expect(res.status).toBe(200)
    expect(getTrack).toHaveBeenCalledWith('123')
    expect(resolveCoverUrl).toHaveBeenCalledTimes(1)
  })
})

describe('musicProxyRouter audio preview', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('resolves the audio URL for a single track on request', async () => {
    const resolveAudioUrl = vi.fn(async () => 'https://up.example.com/audio.mp3')
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

    vi.doMock('@/server/domains/music/providers/registry', () => ({
      getProvider: () => ({
        source: 'netease',
        getTrack,
        resolveAudioUrl,
        resolveCoverUrl: vi.fn(),
      }),
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        body: new ReadableStream(),
      })),
    )

    const { musicProxyRouter: router } = await import('@/server/http/resources/music-proxy')
    const app = createTestApp({ role: 'admin' })
    app.route('/', router)

    const res = await app.request('/admin/music/proxy/audio?source=netease&sourceId=123')
    expect(res.status).toBe(200)
    expect(getTrack).toHaveBeenCalledWith('123')
    expect(resolveAudioUrl).toHaveBeenCalledTimes(1)
  })
})
