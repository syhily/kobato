import type { MusicProvider } from '@kobato/server/domains/music/providers/types'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { __setProviderForTests } from '@kobato/server/domains/music/providers/registry'
import { __setDnsLookupForTests } from '@kobato/server/infra/safe-fetch'
import { makeAuthedCtx, makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const search = vi.fn<MusicProvider['search']>()
const getTrack = vi.fn<MusicProvider['getTrack']>()
const getLyric = vi.fn<MusicProvider['getLyric']>()
const resolveCoverUrl = vi.fn<MusicProvider['resolveCoverUrl']>()
const resolveAudioUrl = vi.fn<MusicProvider['resolveAudioUrl']>()

__setProviderForTests('netease', { source: 'netease', search, getTrack, getLyric, resolveCoverUrl, resolveAudioUrl })

const ROUTES = [
  { route: 'proxyCover', contentType: 'image/jpeg' },
  { route: 'proxyAudio', contentType: 'audio/mpeg' },
] as const

beforeAll(() => {
  __setDnsLookupForTests(async () => [{ address: '203.0.113.10', family: 4 }])
})

afterAll(() => {
  __setDnsLookupForTests(null)
  __setProviderForTests('netease', null)
})

async function proxy(route: 'proxyCover' | 'proxyAudio', context: HandlerContext = makeAuthedCtx()) {
  const { adminMusicRouter } = await import('@kobato/server/http/controllers/admin/music.controller')
  const body = await call(adminMusicRouter[route], { source: 'netease', sourceId: '123' }, { context })
  return new Response(body, { headers: context.responseHeaders })
}

describe.each(ROUTES)('admin.music.$route', ({ route, contentType }) => {
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
    const resolveUrl = route === 'proxyCover' ? resolveCoverUrl : resolveAudioUrl
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
    const res = await proxy(route)
    expect(res.status).toBe(200)
    expect(getTrack).toHaveBeenCalledWith('123')
    expect(resolveUrl).toHaveBeenCalledTimes(1)
  })

  it('rejects an upstream URL pointing at an internal address without fetching it', async () => {
    const resolveUrl = route === 'proxyCover' ? resolveCoverUrl : resolveAudioUrl
    resolveUrl.mockResolvedValueOnce('http://169.254.169.254/latest/meta-data' as never)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(proxy(route)).rejects.toMatchObject({ status: 502 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('serves an unexpected upstream content type as an opaque download', async () => {
    const resolveUrl = route === 'proxyCover' ? resolveCoverUrl : resolveAudioUrl
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
    const res = await proxy(route)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-disposition')).toBe('attachment')
  })

  it('rejects an unknown source parameter with 400', async () => {
    const { adminMusicRouter } = await import('@kobato/server/http/controllers/admin/music.controller')
    await expect(
      call(adminMusicRouter[route], { source: 'spotify' as never, sourceId: '123' }, { context: makeAuthedCtx() }),
    ).rejects.toMatchObject({ status: 400 })
    expect(getTrack).not.toHaveBeenCalled()
  })

  it('rejects anonymous callers with 401', async () => {
    await expect(proxy(route, makePublicCtx())).rejects.toMatchObject({ status: 401 })
    expect(getTrack).not.toHaveBeenCalled()
  })

  it('rejects under-privileged callers with 403', async () => {
    await expect(proxy(route, makeAuthedCtx({ role: 'visitor' }))).rejects.toMatchObject({ status: 403 })
    expect(getTrack).not.toHaveBeenCalled()
  })
})
