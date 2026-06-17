import { beforeEach, describe, expect, it, vi } from 'vitest'

const neteaseModule = {
  searchSongs: vi.fn<() => Promise<{ hits: unknown[]; hasMore: boolean }>>(),
  getSong: vi.fn<() => Promise<unknown>>(),
  getStreamUrl: vi.fn<() => Promise<string>>(),
  getCoverUrl: vi.fn<() => Promise<string>>(),
  getLyric: vi.fn<() => Promise<string | null>>(),
}

vi.mock('@/server/domains/music/netease', () => neteaseModule)

describe('neteaseProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates search to searchSongs and returns hits + hasMore', async () => {
    neteaseModule.searchSongs.mockResolvedValue({ hits: [{ sourceId: '1' }], hasMore: true })

    const { neteaseProvider } = await import('@/server/domains/music/providers/netease')
    const result = await neteaseProvider.search('hello', 10, 0)

    expect(neteaseModule.searchSongs).toHaveBeenCalledWith('hello', 10, 0)
    expect(result).toEqual({ hits: [{ sourceId: '1' }], hasMore: true })
  })

  it('delegates getTrack to getSong and maps the hit', async () => {
    const hit = {
      source: 'netease',
      sourceId: '101',
      name: 'Song',
      artist: ['Artist'],
      album: 'Album',
      picId: 'pic101',
      urlId: '101',
      lyricId: '101',
    }
    neteaseModule.getSong.mockResolvedValue(hit)

    const { neteaseProvider } = await import('@/server/domains/music/providers/netease')
    const track = await neteaseProvider.getTrack('101')

    expect(neteaseModule.getSong).toHaveBeenCalledWith('101')
    expect(track).toEqual(hit)
  })

  it('returns null from getTrack when getSong returns null', async () => {
    neteaseModule.getSong.mockResolvedValue(null)

    const { neteaseProvider } = await import('@/server/domains/music/providers/netease')
    const track = await neteaseProvider.getTrack('404')

    expect(track).toBeNull()
  })

  it('delegates resolveAudioUrl to getStreamUrl', async () => {
    neteaseModule.getStreamUrl.mockResolvedValue('https://audio.mp3')

    const { neteaseProvider } = await import('@/server/domains/music/providers/netease')
    const url = await neteaseProvider.resolveAudioUrl({ urlId: '303' } as any)

    expect(neteaseModule.getStreamUrl).toHaveBeenCalledWith('303')
    expect(url).toBe('https://audio.mp3')
  })

  it('delegates resolveCoverUrl to getCoverUrl', async () => {
    neteaseModule.getCoverUrl.mockResolvedValue('https://cover.jpg')

    const { neteaseProvider } = await import('@/server/domains/music/providers/netease')
    const url = await neteaseProvider.resolveCoverUrl({ picId: 'pic202' } as any)

    expect(neteaseModule.getCoverUrl).toHaveBeenCalledWith('pic202')
    expect(url).toBe('https://cover.jpg')
  })

  it('delegates getLyric to getLyric', async () => {
    neteaseModule.getLyric.mockResolvedValue('[00:00.00] lyric')

    const { neteaseProvider } = await import('@/server/domains/music/providers/netease')
    const lyric = await neteaseProvider.getLyric({ lyricId: '606' } as any)

    expect(neteaseModule.getLyric).toHaveBeenCalledWith('606')
    expect(lyric).toBe('[00:00.00] lyric')
  })

  it('exposes source as netease', async () => {
    const { neteaseProvider } = await import('@/server/domains/music/providers/netease')
    expect(neteaseProvider.source).toBe('netease')
  })
})
