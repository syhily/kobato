import { describe, expect, it, vi } from 'vitest'

import type { ProviderTrack } from '@/server/domains/music/providers/types'

import { encryptId, neteaseProvider } from '@/server/domains/music/providers/netease'

function mockFetch(response: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(response) })),
  )
}

function mockFetchError(status: number, statusText: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false, status, statusText })),
  )
}

function makeTrack(overrides: Partial<ProviderTrack> = {}): ProviderTrack {
  return {
    source: 'netease',
    sourceId: '101',
    name: 'Test Song',
    artist: ['Artist'],
    album: 'Album',
    picId: 'pic101',
    urlId: '101',
    lyricId: '101',
    ...overrides,
  }
}

describe('encryptId', () => {
  it('produces a URL-safe string without / or +', () => {
    const result = encryptId('12345')
    expect(result).not.toContain('/')
    expect(result).not.toContain('+')
    expect(result.length).toBeGreaterThan(0)
  })

  it('is deterministic for the same id', () => {
    expect(encryptId('999')).toBe(encryptId('999'))
  })
})

describe('neteaseProvider', () => {
  it('exposes source as netease', () => {
    expect(neteaseProvider.source).toBe('netease')
  })
})

describe('neteaseProvider resolveCoverUrl', () => {
  it('constructs the correct URL at 300x300', async () => {
    const url = await neteaseProvider.resolveCoverUrl(makeTrack({ picId: '12345' }))
    expect(url).toMatch(/^https:\/\/p3\.music\.126\.net\/.+\/12345\.jpg\?param=300y300$/)
  })
})

describe('neteaseProvider search', () => {
  it('returns typed hits from the API', async () => {
    mockFetch({
      result: {
        songs: [
          {
            id: 101,
            name: 'Hello',
            ar: [{ name: 'Adele' }],
            al: { name: '25', pic_str: 'pic101' },
          },
        ],
      },
    })

    const result = await neteaseProvider.search('hello', 10)
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]).toEqual({
      source: 'netease',
      sourceId: '101',
      name: 'Hello',
      artist: ['Adele'],
      album: '25',
      picId: 'pic101',
      urlId: '101',
      lyricId: '101',
    })
    expect(result.hasMore).toBe(false)

    vi.unstubAllGlobals()
  })

  it('returns empty result for empty keyword', async () => {
    const result = await neteaseProvider.search('  ', 10)
    expect(result).toEqual({ hits: [], hasMore: false })
  })

  it('returns empty result when API has no songs', async () => {
    mockFetch({})
    const result = await neteaseProvider.search('nope', 10)
    expect(result).toEqual({ hits: [], hasMore: false })
    vi.unstubAllGlobals()
  })

  it('falls back to pic when pic_str is absent', async () => {
    mockFetch({
      result: {
        songs: [{ id: 1, name: 'Song', ar: [{ name: 'Solo' }], al: { name: 'Album', pic: 999 } }],
      },
    })

    const result = await neteaseProvider.search('test', 10)
    expect(result.hits[0]?.picId).toBe('999')
    vi.unstubAllGlobals()
  })
})

describe('neteaseProvider getTrack', () => {
  it('returns a single track', async () => {
    mockFetch({
      songs: [{ id: 202, name: 'Song Two', ar: [{ name: 'Band' }], al: { name: 'Album', pic_str: 'pic202' } }],
    })

    const track = await neteaseProvider.getTrack('202')
    expect(track).toEqual({
      source: 'netease',
      sourceId: '202',
      name: 'Song Two',
      artist: ['Band'],
      album: 'Album',
      picId: 'pic202',
      urlId: '202',
      lyricId: '202',
    })
    vi.unstubAllGlobals()
  })

  it('returns null when no songs found', async () => {
    mockFetch({ songs: [] })
    const track = await neteaseProvider.getTrack('999')
    expect(track).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns null when songs field is missing', async () => {
    mockFetch({})
    const track = await neteaseProvider.getTrack('999')
    expect(track).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('neteaseProvider resolveAudioUrl', () => {
  it('returns the streaming URL', async () => {
    mockFetch({
      data: [{ url: 'https://music.163.com/song.mp3', size: 1024000, br: 320000 }],
    })

    const url = await neteaseProvider.resolveAudioUrl(makeTrack({ urlId: '303' }))
    expect(url).toBe('https://music.163.com/song.mp3')
    vi.unstubAllGlobals()
  })

  it('falls back to uf.url when url is missing', async () => {
    mockFetch({
      data: [{ uf: { url: 'https://fallback.mp3' }, size: 0, br: 0 }],
    })

    const url = await neteaseProvider.resolveAudioUrl(makeTrack({ urlId: '404' }))
    expect(url).toBe('https://fallback.mp3')
    vi.unstubAllGlobals()
  })

  it('throws ActionFailure when no URL available', async () => {
    mockFetch({ data: [{ url: '', size: 0, br: 0 }] })

    await expect(neteaseProvider.resolveAudioUrl(makeTrack({ urlId: '505' }))).rejects.toThrow(
      '上游未返回可用的音频地址',
    )
    vi.unstubAllGlobals()
  })

  it('throws ActionFailure when data is absent', async () => {
    mockFetch({})

    await expect(neteaseProvider.resolveAudioUrl(makeTrack({ urlId: '505' }))).rejects.toThrow(
      '上游未返回可用的音频地址',
    )
    vi.unstubAllGlobals()
  })
})

describe('neteaseProvider getLyric', () => {
  it('returns lyric text', async () => {
    mockFetch({
      lrc: { lyric: '[00:00.00] Hello' },
      tlyric: { lyric: '[00:00.00] 你好' },
    })

    const lyric = await neteaseProvider.getLyric(makeTrack({ lyricId: '606' }))
    expect(lyric).toBe('[00:00.00] Hello')
    vi.unstubAllGlobals()
  })

  it('returns null when lyric is empty', async () => {
    mockFetch({})
    const lyric = await neteaseProvider.getLyric(makeTrack({ lyricId: '707' }))
    expect(lyric).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns null when lyric is whitespace', async () => {
    mockFetch({ lrc: { lyric: '   ' } })
    const lyric = await neteaseProvider.getLyric(makeTrack({ lyricId: '808' }))
    expect(lyric).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('neteaseProvider error handling', () => {
  it('throws on non-2xx API response', async () => {
    mockFetchError(503, 'Service Unavailable')

    await expect(neteaseProvider.search('test', 10)).rejects.toThrow('Netease API returned 503 Service Unavailable')
    vi.unstubAllGlobals()
  })
})
