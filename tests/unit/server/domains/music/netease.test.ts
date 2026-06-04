import { describe, expect, it, vi } from 'vitest'

import { encryptId, getCoverUrl, getLyric, getSong, getStreamUrl, searchSongs } from '@/server/domains/music/netease'

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

describe('getCoverUrl', () => {
  it('constructs the correct URL', async () => {
    const url = await getCoverUrl('12345', 400)
    expect(url).toMatch(/^https:\/\/p3\.music\.126\.net\/.+\/12345\.jpg\?param=400y400$/)
  })

  it('defaults size to 300', async () => {
    const url = await getCoverUrl('999')
    expect(url).toContain('?param=300y300')
  })
})

describe('searchSongs', () => {
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

    const hits = await searchSongs('hello', 10)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toEqual({
      source: 'netease',
      sourceId: '101',
      name: 'Hello',
      artist: ['Adele'],
      album: '25',
      picId: 'pic101',
      urlId: '101',
      lyricId: '101',
    })

    vi.unstubAllGlobals()
  })

  it('returns empty array for empty keyword', async () => {
    const hits = await searchSongs('  ')
    expect(hits).toEqual([])
  })

  it('returns empty array when API has no songs', async () => {
    mockFetch({})
    const hits = await searchSongs('nope')
    expect(hits).toEqual([])
    vi.unstubAllGlobals()
  })

  it('falls back to pic when pic_str is absent', async () => {
    mockFetch({
      result: {
        songs: [{ id: 1, name: 'Song', ar: [{ name: 'Solo' }], al: { name: 'Album', pic: 999 } }],
      },
    })

    const hits = await searchSongs('test')
    expect(hits[0]?.picId).toBe('999')
    vi.unstubAllGlobals()
  })
})

describe('getSong', () => {
  it('returns a single hit', async () => {
    mockFetch({
      songs: [{ id: 202, name: 'Song Two', ar: [{ name: 'Band' }], al: { name: 'Album', pic_str: 'pic202' } }],
    })

    const hit = await getSong('202')
    expect(hit).not.toBeNull()
    expect(hit!.sourceId).toBe('202')
    expect(hit!.name).toBe('Song Two')
    vi.unstubAllGlobals()
  })

  it('returns null when no songs found', async () => {
    mockFetch({ songs: [] })
    const hit = await getSong('999')
    expect(hit).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns null when songs field is missing', async () => {
    mockFetch({})
    const hit = await getSong('999')
    expect(hit).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('getStreamUrl', () => {
  it('returns the streaming URL', async () => {
    mockFetch({
      data: [{ url: 'https://music.163.com/song.mp3', size: 1024000, br: 320000 }],
    })

    const url = await getStreamUrl('303', 320)
    expect(url).toBe('https://music.163.com/song.mp3')
    vi.unstubAllGlobals()
  })

  it('falls back to uf.url when url is missing', async () => {
    mockFetch({
      data: [{ uf: { url: 'https://fallback.mp3' }, size: 0, br: 0 }],
    })

    const url = await getStreamUrl('404')
    expect(url).toBe('https://fallback.mp3')
    vi.unstubAllGlobals()
  })

  it('throws ActionFailure when no URL available', async () => {
    mockFetch({ data: [{ url: '', size: 0, br: 0 }] })

    await expect(getStreamUrl('505')).rejects.toThrow('上游未返回可用的音频地址')
    vi.unstubAllGlobals()
  })

  it('throws ActionFailure when data is absent', async () => {
    mockFetch({})

    await expect(getStreamUrl('505')).rejects.toThrow('上游未返回可用的音频地址')
    vi.unstubAllGlobals()
  })
})

describe('getLyric', () => {
  it('returns lyric text', async () => {
    mockFetch({
      lrc: { lyric: '[00:00.00] Hello' },
      tlyric: { lyric: '[00:00.00] 你好' },
    })

    const lyric = await getLyric('606')
    expect(lyric).toBe('[00:00.00] Hello')
    vi.unstubAllGlobals()
  })

  it('returns null when lyric is empty', async () => {
    mockFetch({})
    const lyric = await getLyric('707')
    expect(lyric).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns null when lyric is whitespace', async () => {
    mockFetch({ lrc: { lyric: '   ' } })
    const lyric = await getLyric('808')
    expect(lyric).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('error handling', () => {
  it('throws on non-2xx API response', async () => {
    mockFetchError(503, 'Service Unavailable')

    await expect(searchSongs('test')).rejects.toThrow('Netease API returned 503 Service Unavailable')
    vi.unstubAllGlobals()
  })
})
