import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'

import { decodeHtmlEntities, tencentProvider } from '@/server/domains/music/providers/tencent'

function mockFetchText(response: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(JSON.parse(response)),
        text: () => Promise.resolve(response),
      }),
    ),
  )
}

function mockFetchJson(response: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
        text: () => Promise.resolve(JSON.stringify(response)),
      }),
    ),
  )
}

function mockFetchError(status: number, statusText: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false, status, statusText })),
  )
}

// ── Fixture data ──────────────────────────────────────────────────────────────

function makeRawSong(overrides: Record<string, unknown> = {}) {
  return {
    mid: '001ABCDEF',
    name: 'Test Song',
    singer: [{ name: 'Artist A' }, { name: 'Artist B' }],
    album: { title: 'Test Album ', mid: 'albumMid001' },
    file: {
      media_mid: 'mediaMid001',
      size_128mp3: 4000000,
      size_320mp3: 8000000,
    },
    type: 1,
    ...overrides,
  }
}

// ── decodeHtmlEntities ──────────────────────────────────────────────────────

describe('decodeHtmlEntities', () => {
  it('decodes &amp;', () => {
    expect(decodeHtmlEntities('foo &amp; bar')).toBe('foo & bar')
  })

  it('decodes &apos;', () => {
    expect(decodeHtmlEntities('it&apos;s')).toBe("it's")
  })

  it('decodes &#39; (decimal)', () => {
    expect(decodeHtmlEntities('it&#39;s')).toBe("it's")
  })

  it('decodes &#x27; (hex)', () => {
    expect(decodeHtmlEntities('it&#x27;s')).toBe("it's")
  })

  it('decodes &quot;', () => {
    expect(decodeHtmlEntities('say &quot;hello&quot;')).toBe('say "hello"')
  })

  it('decodes &lt; and &gt;', () => {
    expect(decodeHtmlEntities('&lt;div&gt;')).toBe('<div>')
  })

  it('returns empty string unchanged', () => {
    expect(decodeHtmlEntities('')).toBe('')
  })

  it('handles mixed entities', () => {
    expect(decodeHtmlEntities('&amp;&#39;&#x27;')).toBe("&''")
  })
})

// ── toTrack (via getTrack) ──────────────────────────────────────────────────

describe('tencent provider getTrack', () => {
  it('maps raw song fields to ProviderTrack', async () => {
    const rawSong = makeRawSong()
    mockFetchJson({ songinfo: { data: { track_info: rawSong } } })

    const track = await tencentProvider.getTrack('001ABCDEF')
    expect(track).not.toBeNull()
    expect(track).toEqual({
      source: 'tencent',
      sourceId: '001ABCDEF',
      name: 'Test Song',
      artist: ['Artist A', 'Artist B'],
      album: 'Test Album',
      picId: 'albumMid001',
      urlId: '001ABCDEF',
      lyricId: '001ABCDEF',
    })

    vi.unstubAllGlobals()
  })

  it('returns null when no songs found', async () => {
    mockFetchJson({ songinfo: { data: { track_info: null } } })
    const track = await tencentProvider.getTrack('nonexistent')
    expect(track).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns null when data field is missing', async () => {
    mockFetchJson({})
    const track = await tencentProvider.getTrack('nonexistent')
    expect(track).toBeNull()
    vi.unstubAllGlobals()
  })
})

// ── search ──────────────────────────────────────────────────────────────────

describe('tencent provider search', () => {
  it('returns correctly mapped hits', async () => {
    const rawSong = makeRawSong()

    // First call: search API
    // Second call: resolveAudioUrl (get song detail)
    // Third call: resolveAudioUrl (get vkey)
    // Fourth call: resolveCoverUrl (direct URL, no fetch)

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          // Search response
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                req_1: { data: { body: { song: { list: [rawSong] } } } },
              }),
            text: () => Promise.resolve(''),
          }
        }
        if (callCount === 2) {
          // Song detail for URL resolution
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                songinfo: { data: { track_info: rawSong } },
              }),
            text: () => Promise.resolve(''),
          }
        }
        // Vkey response
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              req_0: {
                data: {
                  sip: ['https://dl.stream.qqmusic.qq.com/'],
                  midurlinfo: [
                    { vkey: 'vkey0', purl: 'F000mediaMid001.flac?vkey=vkey0' },
                    { vkey: 'vkey1', purl: 'M800mediaMid001.mp3?vkey=vkey1' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                  ],
                },
              },
            }),
          text: () => Promise.resolve(''),
        }
      }),
    )

    const result = await tencentProvider.search('test song', 10)
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]).toEqual({
      source: 'tencent',
      sourceId: '001ABCDEF',
      name: 'Test Song',
      artist: ['Artist A', 'Artist B'],
      album: 'Test Album',
      coverUrl: 'https://y.gtimg.cn/music/photo_new/T002R300x300M000albumMid001.jpg?max_age=2592000',
      previewUrl: 'https://dl.stream.qqmusic.qq.com/M800mediaMid001.mp3?vkey=vkey1',
    })
    expect(result.hasMore).toBe(true)

    vi.unstubAllGlobals()
  })

  it('returns empty result for empty keyword', async () => {
    const result = await tencentProvider.search('  ', 10)
    expect(result).toEqual({ hits: [], hasMore: false })
  })

  it('returns empty result when API has no songs', async () => {
    mockFetchJson({ req_1: { data: { body: { song: { list: [] } } } } })
    const result = await tencentProvider.search('nope', 10)
    expect(result).toEqual({ hits: [], hasMore: false })
    vi.unstubAllGlobals()
  })
})

// ── resolveAudioUrl ─────────────────────────────────────────────────────────

describe('tencent provider resolveAudioUrl', () => {
  it('falls back through quality tiers', async () => {
    const rawSong = makeRawSong({
      file: {
        media_mid: 'mediaMid001',
        size_flac: 0,
        size_320mp3: 0,
        size_192aac: 0,
        size_128mp3: 4000000,
      },
    })

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          // Song detail
          return {
            ok: true,
            json: () => Promise.resolve({ songinfo: { data: { track_info: rawSong } } }),
            text: () => Promise.resolve(''),
          }
        }
        // Vkey response - only 128 tier has a key
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              req_0: {
                data: {
                  sip: ['https://dl.stream.qqmusic.qq.com/'],
                  midurlinfo: [
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: 'valid_key', purl: 'M500mediaMid001.mp3?vkey=valid_key' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                  ],
                },
              },
            }),
          text: () => Promise.resolve(''),
        }
      }),
    )

    const track = {
      source: 'tencent',
      sourceId: '001ABCDEF',
      name: 'Test',
      artist: [],
      album: '',
      picId: 'albumMid001',
      urlId: '001ABCDEF',
      lyricId: '001ABCDEF',
    }
    const url = await tencentProvider.resolveAudioUrl(track)
    expect(url).toBe('https://dl.stream.qqmusic.qq.com/M500mediaMid001.mp3?vkey=valid_key')

    vi.unstubAllGlobals()
  })

  it('throws when no quality tier has a vkey', async () => {
    const rawSong = makeRawSong({
      file: { media_mid: 'mediaMid001', size_128mp3: 4000000 },
    })

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return {
            ok: true,
            json: () => Promise.resolve({ songinfo: { data: { track_info: rawSong } } }),
            text: () => Promise.resolve(''),
          }
        }
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              req_0: {
                data: {
                  sip: ['https://dl.stream.qqmusic.qq.com/'],
                  midurlinfo: [
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                    { vkey: '', purl: '' },
                  ],
                },
              },
            }),
          text: () => Promise.resolve(''),
        }
      }),
    )

    const track = {
      source: 'tencent',
      sourceId: '001ABCDEF',
      name: 'Test',
      artist: [],
      album: '',
      picId: 'albumMid001',
      urlId: '001ABCDEF',
      lyricId: '001ABCDEF',
    }
    await expect(tencentProvider.resolveAudioUrl(track)).rejects.toThrow('上游未返回可用的音频地址')

    vi.unstubAllGlobals()
  })
})

// ── resolveCoverUrl ─────────────────────────────────────────────────────────

describe('tencent provider resolveCoverUrl', () => {
  it('returns direct cover URL template', async () => {
    const track = {
      source: 'tencent',
      sourceId: '001ABCDEF',
      name: 'Test',
      artist: [],
      album: '',
      picId: 'albumMid001',
      urlId: '001ABCDEF',
      lyricId: '001ABCDEF',
    }
    const url = await tencentProvider.resolveCoverUrl(track)
    expect(url).toBe('https://y.gtimg.cn/music/photo_new/T002R300x300M000albumMid001.jpg?max_age=2592000')
  })
})

// ── getLyric ────────────────────────────────────────────────────────────────

describe('tencent provider getLyric', () => {
  it('handles base64 + callback wrapper stripping', async () => {
    const lyricText = Buffer.from('[00:00.00] Hello World').toString('base64')
    const wrappedResponse = `MusicJsonCallback({"lyric":"${lyricText}"})`

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(wrappedResponse),
        }),
      ),
    )

    const track = {
      source: 'tencent',
      sourceId: '001ABCDEF',
      name: 'Test',
      artist: [],
      album: '',
      picId: 'albumMid001',
      urlId: '001ABCDEF',
      lyricId: '001ABCDEF',
    }
    const lyric = await tencentProvider.getLyric(track)
    expect(lyric).toBe('[00:00.00] Hello World')

    vi.unstubAllGlobals()
  })

  it('returns null when no lyric field', async () => {
    const wrappedResponse = 'MusicJsonCallback({})'

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(wrappedResponse),
        }),
      ),
    )

    const track = {
      source: 'tencent',
      sourceId: '001ABCDEF',
      name: 'Test',
      artist: [],
      album: '',
      picId: 'albumMid001',
      urlId: '001ABCDEF',
      lyricId: '001ABCDEF',
    }
    const lyric = await tencentProvider.getLyric(track)
    expect(lyric).toBeNull()

    vi.unstubAllGlobals()
  })

  it('returns null when lyric is whitespace', async () => {
    const lyricText = Buffer.from('   ').toString('base64')
    const wrappedResponse = `MusicJsonCallback({"lyric":"${lyricText}"})`

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(wrappedResponse),
        }),
      ),
    )

    const track = {
      source: 'tencent',
      sourceId: '001ABCDEF',
      name: 'Test',
      artist: [],
      album: '',
      picId: 'albumMid001',
      urlId: '001ABCDEF',
      lyricId: '001ABCDEF',
    }
    const lyric = await tencentProvider.getLyric(track)
    expect(lyric).toBeNull()

    vi.unstubAllGlobals()
  })

  it('decodes HTML entities in lyrics', async () => {
    const rawLyric = 'it&apos;s &amp; it&#39;s'
    const lyricText = Buffer.from(rawLyric).toString('base64')
    const wrappedResponse = `MusicJsonCallback({"lyric":"${lyricText}"})`

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(wrappedResponse),
        }),
      ),
    )

    const track = {
      source: 'tencent',
      sourceId: '001ABCDEF',
      name: 'Test',
      artist: [],
      album: '',
      picId: 'albumMid001',
      urlId: '001ABCDEF',
      lyricId: '001ABCDEF',
    }
    const lyric = await tencentProvider.getLyric(track)
    expect(lyric).toBe("it's & it's")

    vi.unstubAllGlobals()
  })
})

// ── error handling ──────────────────────────────────────────────────────────

describe('tencent provider error handling', () => {
  it('throws on non-2xx API response', async () => {
    mockFetchError(503, 'Service Unavailable')

    await expect(tencentProvider.getTrack('001')).rejects.toThrow('Tencent API returned 503 Service Unavailable')
    vi.unstubAllGlobals()
  })
})
