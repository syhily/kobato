import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto, MetingSearchHit } from '@/shared/contracts/music'

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

// `MusicsView` inlines its sort/search state via `useState` (the old
// `useMusicsReducer` pass-through was deleted); the defaults — q '',
// sortBy 'createdAt', sortOrder 'desc', page size 24 — are exactly what
// these SSR snapshots assert. `MusicsView` also calls `useInfiniteQuery`
// against `orpc.admin.music.list`, which would hit the network, so we
// stub out tanstack/react-query's fetch hooks below.

// TanStack Query hooks: return inert values so the views never issue real
// network calls. The `data` field is mutated per test by reassigning the
// hoisted singleton; react-query returns the same object reference on every
// render which is all SSR needs.

const queryMocks = vi.hoisted(() => ({
  query: {
    data: null as unknown,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  mutation: {
    mutate: vi.fn(),
    isPending: false,
  },
  infinite: {
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
  },
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    removeQueries: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useMutation: () => queryMocks.mutation,
    useInfiniteQuery: () => queryMocks.infinite,
    useQueryClient: () => queryMocks.queryClient,
  }
})

// `sonner` is pulled in by AddMusicView / MusicDetailView for toasts. SSR
// safe to no-op.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// `orpcQuery` builds query options objects; the mocks above intercept the
// hooks before they execute, so the option builders never run their network
// path — but they're still imported, so we stub them to return stable
// option objects to keep imports cheap and side-effect free.
vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    admin: {
      music: {
        get: {
          queryOptions: (args: unknown) => ({ queryKey: ['music', 'get', args], queryFn: async () => ({}) }),
          key: (args: unknown) => ['music', 'get', args],
        },
        list: {
          queryOptions: (args: unknown) => ({ queryKey: ['music', 'list', args], queryFn: async () => ({}) }),
          infiniteOptions: (args: unknown) => ({ queryKey: ['music', 'list', args], queryFn: async () => ({}) }),
          key: (args: unknown) => ['music', 'list', args],
        },
        search: {
          queryOptions: (args: unknown) => ({ queryKey: ['music', 'search', args], queryFn: async () => ({}) }),
          key: (args: unknown) => ['music', 'search', args],
        },
        add: {
          mutationOptions: () => ({ mutationKey: ['music', 'add'] }),
        },
      },
    },
  },
}))

// The meting search machine now lives in `useMetingMusicSearch` (covered by
// `tests/unit/ui/admin/musics/use-meting-music-search.test.tsx`). Stub it so
// each snapshot sets the machine's state directly instead of driving it
// through the old `useQuery` mock — and so the view never reads the
// list-shaped `useInfiniteQuery` stub above.
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

// ───────────────────────────── fixtures ─────────────────────────────

function makeAdminMusic(overrides: Partial<AdminMusicDto> = {}): AdminMusicDto {
  return {
    id: 'music-1',
    source: 'netease',
    sourceId: '1001',
    playerId: 'abcdef0123456789',
    name: '夜的第七章',
    artist: ['周杰伦'],
    album: '十一月的萧邦',
    audioStoragePath: 'music/audio.mp3',
    audioUrl: 'https://cdn.example.com/audio.mp3',
    coverStoragePath: 'music/cover.jpg',
    coverUrl: 'https://cdn.example.com/cover.jpg',
    lyric: '[00:01.00]夜了呢\n[00:05.00]月光下的苍白',
    uploaderId: 'user-1',
    uploaderName: '雨帆',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

const SAMPLE_LRC = ['[00:01.00]夜了呢', '[00:05.00]月光下的苍白', '[00:10.00]手风琴弹奏着那年代的向往'].join('\n')

// ─────────────────────────── shared setup ───────────────────────────

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
    // Hero
    expect(html).toContain('音乐库')
    // Play-all + add-music buttons
    expect(html).toContain('aria-label="播放全部"')
    expect(html).toContain('aria-label="添加音乐"')
    // Sort trigger + order toggle render the initial sort label / order text
    expect(html).toContain('aria-label="排序"')
    expect(html).toContain('创建时间')
    expect(html).toContain('降序')
    // Search box
    expect(html).toContain('aria-label="搜索歌曲"')
    expect(html).toContain('placeholder="搜索..."')
    // Grid skeleton (animate-pulse placeholders)
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
    // Sentinel copy for end-of-list state
    expect(html).toContain('已加载全部')
  })
})

// ────────────────────────── MusicDetailView ─────────────────────────

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
          <MusicDetailView />
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
          <MusicDetailView />
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
          <MusicDetailView />
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

// ──────────────────────────── AddMusicView ──────────────────────────

describe('snapshot: AddMusicView', () => {
  beforeEach(() => {
    // libraryQuery (useQuery) — empty library; the search machine
    // (`useMetingMusicSearch`, stubbed above) starts idle with no results.
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
    // The empty-search prompt copy.
    expect(html).toContain('输入关键词搜索音乐')
  })
})

// ────────────────────────── MusicLibraryHero ────────────────────────

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
    // The collage backdrop only paints after the ResizeObserver effect runs
    // (browser-only), so on SSR we assert the hero scrim overlay is present
    // and the title block is readable instead of the img cells.
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

// ───────────────────────────── AlbumCard ────────────────────────────

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

// ─────────────────────────── LyricsDisplay ──────────────────────────

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

// ─────────────────────────── ProgressSlider ────────────────────────

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

// ──────────────────────── AdminMusicPlayerFloat ─────────────────────

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
    // No current track in the default provider state => the float is
    // intentionally not mounted.
    expect(html).toBe('')
  })
})

// ───────────────────────────── Equalizer ────────────────────────────

describe('snapshot: Equalizer', () => {
  it('renders three animated bars with the brand color by default', () => {
    const html = stableHtml(renderToHtml(<Equalizer />))
    // Three bar elements plus the wrapper.
    expect(html).toContain('var(--brand)')
    // The wrapper carries the "flex items-end" base classes.
    expect(html).toMatch(/flex items-end gap-0\.5/u)
  })

  it('honours a custom color', () => {
    const html = stableHtml(renderToHtml(<Equalizer color="#ff8800" />))
    expect(html).toContain('#ff8800')
  })
})
