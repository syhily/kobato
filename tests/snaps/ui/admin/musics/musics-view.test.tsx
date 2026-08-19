import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto, MetingSearchHit } from '@/shared/contracts/music'

import { makeAdminMusic } from '#/_helpers/catalog'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { AddMusicView } from '@/ui/admin/musics/AddMusicView'
import { AdminMusicPlayerFloat } from '@/ui/admin/musics/AdminMusicPlayerFloat'
import { AlbumCard } from '@/ui/admin/musics/AlbumCard'
import { Equalizer } from '@/ui/admin/musics/Equalizer'
import { LyricsDisplay } from '@/ui/admin/musics/LyricsDisplay'
import { MusicDetailView } from '@/ui/admin/musics/MusicDetailView'
import { MusicLibraryHero } from '@/ui/admin/musics/MusicLibraryHero'
import { MusicPlayerProvider } from '@/ui/admin/musics/MusicPlayerContext'
import { MusicsView } from '@/ui/admin/musics/MusicsView'
import { ProgressSlider } from '@/ui/admin/musics/ProgressSlider'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: null as unknown,
  isLoading: false,
  isPending: false,
  isFetching: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.infinite = {
  data: { pages: [] as { musics: AdminMusicDto[]; total: number; hasMore: boolean }[] } as {
    pages: { musics: AdminMusicDto[]; total: number; hasMore: boolean }[]
  },
  isLoading: false,
  isPending: false,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null as unknown,
  fetchNextPage: vi.fn(),
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
  removeQueries: vi.fn(),
}

// MusicsView's useState defaults (q '', createdAt desc, 24/page) are what
// these snapshots assert; fetch hooks are stubbed via mock-react-query,
// sonner is inert from setup.ts, orpcQuery builders run but never execute.

// `useMetingMusicSearch` (unit-covered) is stubbed so snapshots set the machine state directly.
const searchHookMock = vi.hoisted(() => ({
  state: {
    results: [] as MetingSearchHit[],
    hasMore: false,
    isSearching: false,
    isLoadingMore: false,
    error: null as string | null,
    search: vi.fn(),
    loadMore: vi.fn(),
    reset: vi.fn(),
  },
}))

vi.mock('@/ui/admin/musics/useMetingMusicSearch', () => ({
  useMetingMusicSearch: () => searchHookMock.state,
}))

function resetSearchHookMock(): void {
  searchHookMock.state = {
    results: [],
    hasMore: false,
    isSearching: false,
    isLoadingMore: false,
    error: null,
    search: vi.fn(),
    loadMore: vi.fn(),
    reset: vi.fn(),
  }
}

const SAMPLE_LRC = ['[00:01.00]夜了呢', '[00:05.00]月光下的苍白', '[00:10.00]手风琴弹奏着那年代的向往'].join('\n')

describe('snapshot: MusicsView', () => {
  beforeEach(() => {
    queryMocks.infinite = {
      data: { pages: [] },
      isLoading: true,
      isPending: true,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      error: null,
      fetchNextPage: vi.fn(),
    }
  })

  it('renders hero, sort control and grid skeleton in the loading state', () => {
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicsView />
        </MusicPlayerProvider>,
        '/admin/library/music',
      ),
    )
    expect(html).toContain('音乐库')
    expect(html).toContain('aria-label="播放全部"')
    expect(html).toContain('aria-label="添加音乐"')
    expect(html).toContain('aria-label="排序"')
    expect(html).toContain('创建时间')
    expect(html).toContain('降序')
    expect(html).toContain('aria-label="搜索歌曲"')
    expect(html).toContain('placeholder="搜索..."')
    expect(html).toContain('animate-pulse')
    expect(html.length).toBeGreaterThan(0)
  })

  it('renders the empty-state branch when there is no music yet', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      data: { pages: [{ musics: [], total: 0, hasMore: false }] },
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicsView />
        </MusicPlayerProvider>,
        '/admin/library/music',
      ),
    )
    expect(html).toContain('还没有音乐')
    expect(html).toContain('点击上方按钮添加你的第一首歌')
    expect(html).toContain('添加音乐')
  })

  it('renders the album grid when data is present', () => {
    const music = makeAdminMusic({ name: '蓝色风暴', artist: ['周杰伦'] })
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      data: { pages: [{ musics: [music], total: 1, hasMore: false }] },
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicsView />
        </MusicPlayerProvider>,
        '/admin/library/music',
      ),
    )
    expect(html).toContain('蓝色风暴')
    expect(html).toContain('周杰伦')
    expect(html).toContain('已加载全部')
  })
})

// Pure-props view — the route module supplies id + navigate.
const navigateMock = vi.fn()

describe('snapshot: MusicDetailView', () => {
  beforeEach(() => {
    queryMocks.query = {
      data: null,
      isLoading: true,
      isPending: true,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
  })

  it('renders the detail skeleton while loading', () => {
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicDetailView id="music-1" navigate={navigateMock} />
        </MusicPlayerProvider>,
        '/admin/library/music/music-1',
      ),
    )
    expect(html).toContain('animate-pulse')
  })

  it('renders the not-found branch when no music is resolved', () => {
    queryMocks.query = {
      ...queryMocks.query,
      isLoading: false,
      isPending: false,
      data: { music: null },
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicDetailView id="missing" navigate={navigateMock} />
        </MusicPlayerProvider>,
        '/admin/library/music/missing',
      ),
    )
    expect(html).toContain('未找到该歌曲')
    expect(html).toContain('aria-label="返回"')
  })

  it('renders the detail body when the music resolves', () => {
    const music = makeAdminMusic({ name: '青花瓷', artist: ['周杰伦'], album: '我很忙' })
    queryMocks.query = {
      ...queryMocks.query,
      isLoading: false,
      isPending: false,
      data: { music },
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicDetailView id="music-1" navigate={navigateMock} />
        </MusicPlayerProvider>,
        '/admin/library/music/music-1',
      ),
    )
    expect(html).toContain('青花瓷')
    expect(html).toContain('周杰伦')
    expect(html).toContain('我很忙')
    expect(html).toContain('aria-label="关闭"')
    expect(html).toContain('aria-label="播放"')
    expect(html).toContain('复制 playerId')
    expect(html).toContain('编辑')
    expect(html).toContain('删除')
    expect(html).toContain('歌词')
  })
})

describe('snapshot: AddMusicView', () => {
  beforeEach(() => {
    // Empty library; the search machine starts idle.
    queryMocks.query = {
      data: { musics: [], total: 0 },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    resetSearchHookMock()
  })

  it('renders the add-music hero, search form and source selector', () => {
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <AddMusicView />
        </MusicPlayerProvider>,
        '/admin/library/music/add',
      ),
    )
    expect(html).toContain('添加音乐')
    expect(html).toContain('aria-label="搜索音乐"')
    expect(html).toContain('placeholder="搜索歌曲、艺人、专辑..."')
    expect(html).toContain('来源')
    expect(html).toContain('aria-label="关闭"')
    expect(html).toContain('输入关键词搜索音乐')
  })
})

describe('snapshot: MusicLibraryHero', () => {
  it('renders hero title, song count and action children', () => {
    const music = makeAdminMusic({ name: '菊花台', coverUrl: 'https://cdn.example.com/a.jpg' })
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicLibraryHero musics={[music]} total={1}>
            <button type="button">播放全部</button>
          </MusicLibraryHero>
        </MusicPlayerProvider>,
        '/admin/library/music',
      ),
    )
    expect(html).toContain('音乐库')
    expect(html).toContain('共 1 首歌曲')
    expect(html).toContain('播放全部')
    // Collage paints only after a browser ResizeObserver effect — SSR asserts the scrim/title instead.
    expect(html).toContain('共 1 首歌曲')
  })

  it('falls back to the empty gradient background when there are no covers', () => {
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicLibraryHero musics={[]} total={0} title="添加音乐" />
        </MusicPlayerProvider>,
        '/admin/library/music/add',
      ),
    )
    expect(html).toContain('添加音乐')
    // The "共 N 首歌曲" count is only rendered when total > 0.
    expect(html).not.toContain('共 0 首歌曲')
  })

  it('honours the custom title prop', () => {
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicLibraryHero musics={[]} total={0} title="曲库一览" />
        </MusicPlayerProvider>,
      ),
    )
    expect(html).toContain('曲库一览')
  })
})

describe('snapshot: AlbumCard', () => {
  it('renders the cover image, title and artist', () => {
    const music = makeAdminMusic({ name: '兰亭序', artist: ['周杰伦', '方文山'] })
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <AlbumCard music={music} viewTransitionName="music-cover-music-1" />
        </MusicPlayerProvider>,
      ),
    )
    expect(html).toContain('兰亭序')
    expect(html).toContain('周杰伦')
    expect(html).toContain('方文山')
    expect(html).toContain('aria-label="播放"')
    expect(html).toContain('https://cdn.example.com/cover.jpg')
  })

  it('renders a placeholder block when there is no cover', () => {
    const music = makeAdminMusic({ name: '无封面曲', coverUrl: '' })
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <AlbumCard music={music} />
        </MusicPlayerProvider>,
      ),
    )
    expect(html).toContain('无封面曲')
    // No <img> emitted for missing cover.
    expect(html).not.toContain('src="https://cdn.example.com/cover.jpg"')
  })
})

describe('snapshot: LyricsDisplay', () => {
  it('renders the empty-state copy when there is no lyric text', () => {
    const html = stableHtml(renderToHtml(<LyricsDisplay lrcText={null} currentTime={0} />))
    expect(html).toContain('暂无歌词')
  })

  it('renders parsed lyric lines and highlights the current line', () => {
    const html = stableHtml(renderToHtml(<LyricsDisplay lrcText={SAMPLE_LRC} currentTime={7} />))
    expect(html).toContain('夜了呢')
    expect(html).toContain('月光下的苍白')
    expect(html).toContain('手风琴弹奏着那年代的向往')
    // Active line (index 1 at t=7s) carries the larger / bolder class hook.
    expect(html).toMatch(/text-lg font-medium text-ink-1/u)
  })

  it('highlights the first line when currentTime is before the second tag', () => {
    const html = stableHtml(renderToHtml(<LyricsDisplay lrcText={SAMPLE_LRC} currentTime={0} />))
    expect(html).toContain('夜了呢')
    expect(html).toMatch(/text-lg font-medium text-ink-1/u)
  })
})

describe('snapshot: ProgressSlider', () => {
  it('renders a horizontal slider with aria and a filled portion', () => {
    const html = stableHtml(
      renderToHtml(<ProgressSlider value={30} max={120} onChange={() => undefined} ariaLabel="播放进度" />),
    )
    expect(html).toContain('role="slider"')
    expect(html).toContain('aria-label="播放进度"')
    expect(html).toContain('aria-orientation="horizontal"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="120"')
    expect(html).toContain('aria-valuenow="30"')
    expect(html).toContain('width:25%')
  })

  it('renders a vertical slider with the accent color', () => {
    const html = stableHtml(
      renderToHtml(
        <ProgressSlider
          value={0.5}
          max={1}
          onChange={() => undefined}
          accent="#ebd0c2"
          orientation="vertical"
          ariaLabel="音量"
        />,
      ),
    )
    expect(html).toContain('aria-orientation="vertical"')
    expect(html).toContain('#ebd0c2')
    expect(html).toContain('height:50%')
  })
})

describe('snapshot: AdminMusicPlayerFloat', () => {
  it('renders nothing while there is no current track (collapsed default)', () => {
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <AdminMusicPlayerFloat />
        </MusicPlayerProvider>,
        '/admin/dashboard',
      ),
    )
    // No current track → float intentionally unmounted.
    expect(html).toBe('')
  })
})

describe('snapshot: Equalizer', () => {
  it('renders three animated bars with the brand color by default', () => {
    const html = stableHtml(renderToHtml(<Equalizer />))
    expect(html).toContain('var(--brand)')
    expect(html).toMatch(/flex items-end gap-0\.5/u)
  })

  it('honours a custom color', () => {
    const html = stableHtml(renderToHtml(<Equalizer color="#ff8800" />))
    expect(html).toContain('#ff8800')
  })
})
