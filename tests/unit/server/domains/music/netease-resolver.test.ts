import { describe, expect, it, vi } from 'vitest'

import { NeteaseResolver, encryptId, formatSong } from '@/server/domains/music/netease-resolver'

describe('encryptId', () => {
  it('produces a base64-like string with safe url chars', () => {
    const result = encryptId('12345')
    expect(result).not.toContain('/')
    expect(result).not.toContain('+')
    expect(result.length).toBeGreaterThan(0)
  })

  it('is deterministic for the same id', () => {
    expect(encryptId('999')).toBe(encryptId('999'))
  })
})

describe('formatSong', () => {
  it('maps netease raw shape to formatted shape', () => {
    const raw = {
      id: 123,
      name: 'Test Song',
      ar: [{ name: 'Artist A' }, { name: 'Artist B' }],
      al: { name: 'Test Album', pic_str: '456', pic: 789 },
    }
    expect(formatSong(raw)).toEqual({
      id: 123,
      name: 'Test Song',
      artist: ['Artist A', 'Artist B'],
      album: 'Test Album',
      pic_id: '456',
      url_id: 123,
      lyric_id: 123,
      source: 'netease',
    })
  })

  it('falls back to pic when pic_str is absent', () => {
    const raw = {
      id: 1,
      name: 'Song',
      ar: [{ name: 'Solo' }],
      al: { name: 'Album', pic: 999 },
    }
    expect(formatSong(raw).pic_id).toBe(999)
  })
})

describe('NeteaseResolver', () => {
  describe('pic', () => {
    it('returns a JSON string with the constructed pic url', async () => {
      const resolver = new NeteaseResolver()
      const result = await resolver.pic('12345', 400)
      const parsed = JSON.parse(result)
      expect(parsed.url).toMatch(/^https:\/\/p3\.music\.126\.net\/.+\/12345\.jpg\?param=400y400$/)
    })

    it('defaults size to 300', async () => {
      const resolver = new NeteaseResolver()
      const parsed = JSON.parse(await resolver.pic('999'))
      expect(parsed.url).toContain('?param=300y300')
    })
  })

  describe('search', () => {
    it('returns formatted songs from the API response', async () => {
      const resolver = new NeteaseResolver()
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
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
              }),
          }),
        ),
      )

      const raw = await resolver.search('hello', { limit: 10 })
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
      expect(parsed).toHaveLength(1)
      expect(parsed[0]).toMatchObject({
        id: 101,
        name: 'Hello',
        artist: ['Adele'],
        album: '25',
        source: 'netease',
      })

      vi.unstubAllGlobals()
    })

    it('returns empty array when no songs field is present', async () => {
      const resolver = new NeteaseResolver()
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          }),
        ),
      )

      const raw = await resolver.search('nope')
      expect(JSON.parse(raw)).toEqual([])
      vi.unstubAllGlobals()
    })
  })

  describe('song', () => {
    it('returns a single-item formatted array', async () => {
      const resolver = new NeteaseResolver()
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                songs: [
                  {
                    id: 202,
                    name: 'Song Two',
                    ar: [{ name: 'Band' }],
                    al: { name: 'Album', pic_str: 'pic202' },
                  },
                ],
              }),
          }),
        ),
      )

      const raw = await resolver.song('202')
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.id).toBe(202)
      vi.unstubAllGlobals()
    })
  })

  describe('url', () => {
    it('returns url payload from the API', async () => {
      const resolver = new NeteaseResolver()
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: [
                  {
                    url: 'https://music.163.com/song.mp3',
                    size: 1024000,
                    br: 320000,
                  },
                ],
              }),
          }),
        ),
      )

      const raw = await resolver.url('303', 320)
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed.url).toBe('https://music.163.com/song.mp3')
      expect(parsed.size).toBe(1024000)
      expect(parsed.br).toBe(320)
      vi.unstubAllGlobals()
    })

    it('falls back to uf.url when url is missing', async () => {
      const resolver = new NeteaseResolver()
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: [{ uf: { url: 'https://fallback.mp3' }, size: 0, br: 0 }],
              }),
          }),
        ),
      )

      const raw = await resolver.url('404')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed.url).toBe('https://fallback.mp3')
      vi.unstubAllGlobals()
    })

    it('returns empty url when data is absent', async () => {
      const resolver = new NeteaseResolver()
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
      )

      const raw = await resolver.url('505')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed.url).toBe('')
      expect(parsed.br).toBe(0)
      vi.unstubAllGlobals()
    })
  })

  describe('lyric', () => {
    it('returns lyric and tlyric from the API', async () => {
      const resolver = new NeteaseResolver()
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                lrc: { lyric: '[00:00.00] Hello' },
                tlyric: { lyric: '[00:00.00] 你好' },
              }),
          }),
        ),
      )

      const raw = await resolver.lyric('606')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed.lyric).toBe('[00:00.00] Hello')
      expect(parsed.tlyric).toBe('[00:00.00] 你好')
      vi.unstubAllGlobals()
    })

    it('returns empty strings when lyric fields are missing', async () => {
      const resolver = new NeteaseResolver()
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
      )

      const raw = await resolver.lyric('707')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed.lyric).toBe('')
      expect(parsed.tlyric).toBe('')
      vi.unstubAllGlobals()
    })
  })

  describe('post error handling', () => {
    it('throws on non-2xx responses', async () => {
      const resolver = new NeteaseResolver()
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
          }),
        ),
      )

      await expect(resolver.search('test')).rejects.toThrow('Netease API returned 503 Service Unavailable')
      vi.unstubAllGlobals()
    })
  })
})
