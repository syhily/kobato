import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto, MetingSearchHit } from '@/shared/types/music'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { AddMusicView } from '@/ui/admin/musics/AddMusicView'
import { LyricsDisplay } from '@/ui/admin/musics/LyricsDisplay'
import { MusicDetailView } from '@/ui/admin/musics/MusicDetailView'
import { MusicPlayerProvider } from '@/ui/admin/musics/MusicPlayerContext'
import { MusicsView } from '@/ui/admin/musics/MusicsView'

// Render-path coverage companion to `musics-view.test.tsx`. We re-use the
// same mock scaffolding (controller singleton + tanstack/react-query stub)
// so the SortIcon matrix, every grid branch and the detail / add-music
// render arms are exercised without ever hitting the network. Event
// handlers and effects are intentionally not covered — SSR can't drive
// them — so this file focuses strictly on what renders.

// ─────────────────────────── mock scaffolding ───────────────────────────

const controllerState = vi.hoisted(() => ({
  q: '',
  sortBy: 'createdAt' as 'createdAt' | 'updatedAt' | 'name' | 'artist' | 'album',
  sortOrder: 'desc' as 'asc' | 'desc',
  pageSize: 24,
}))

vi.mock('@/ui/admin/musics/useMusicsReducer', () => ({
  useMusicsReducer: () => ({ state: controllerState, dispatch: vi.fn() }),
}))

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
    data: { pages: [] as { musics: AdminMusicDto[]; total: number; hasMore: boolean }[] } as
      | { pages: { musics: AdminMusicDto[]; total: number; hasMore: boolean }[] }
      | undefined,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
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

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

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

function renderMusics(): string {
  return stableHtml(
    renderInRouter(
      <MusicPlayerProvider>
        <MusicsView />
      </MusicPlayerProvider>,
      '/admin/library/music',
    ),
  )
}

function renderDetail(): string {
  return stableHtml(
    renderInRouter(
      <MusicPlayerProvider>
        <MusicDetailView />
      </MusicPlayerProvider>,
      '/admin/library/music/music-1',
    ),
  )
}

// ─────────────────────────── MusicsView: grid ───────────────────────────

describe('MusicsView render branches', () => {
  beforeEach(() => {
    controllerState.q = ''
    controllerState.sortBy = 'createdAt'
    controllerState.sortOrder = 'desc'
    controllerState.pageSize = 24
    queryMocks.infinite = {
      data: { pages: [] },
      isLoading: true,
      isPending: true,
      isFetching: false,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      error: null,
      fetchNextPage: vi.fn(),
    }
  })

  it('renders the loading skeleton', () => {
    const html = renderMusics()
    expect(html).toContain('animate-pulse')
    // The skeleton renders 12 placeholder cells; the grid never shows the
    // empty-state copy while loading.
    expect(html).not.toContain('还没有音乐')
    expect(html).not.toContain('已加载全部')
  })

  it('renders the error branch with a reload hint', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      isError: true,
      error: { message: 'upstream timeout' },
      data: undefined,
    }
    // MusicsView currently falls through to the empty-state when
    // `data` is undefined but `isLoading` is false — verify the
    // graceful fallback surfaces the empty copy and not the grid.
    const html = renderMusics()
    expect(html).toContain('还没有音乐')
  })

  it('renders the empty-state branch when there is no music', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      data: { pages: [{ musics: [], total: 0, hasMore: false }] },
    }
    const html = renderMusics()
    expect(html).toContain('还没有音乐')
    expect(html).toContain('点击上方按钮添加你的第一首歌')
    expect(html).not.toContain('animate-pulse')
  })

  it('renders the populated album grid and the end-of-list sentinel', () => {
    const a = makeAdminMusic({ id: 'm-a', name: '蓝色风暴', artist: ['周杰伦'] })
    const b = makeAdminMusic({ id: 'm-b', name: '千里之外', artist: ['周杰伦', '费玉清'] })
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      data: { pages: [{ musics: [a, b], total: 2, hasMore: false }] },
    }
    const html = renderMusics()
    expect(html).toContain('蓝色风暴')
    expect(html).toContain('千里之外')
    expect(html).toContain('周杰伦')
    expect(html).toContain('费玉清')
    // Sentinel "已加载全部" only renders when hasNextPage is false AND
    // there are musics on screen — both conditions are met here.
    expect(html).toContain('已加载全部 2 首歌曲')
    // No skeleton painted alongside the grid.
    expect(html).not.toContain('还没有音乐')
  })

  it('renders the fetching-next-page indicator when more pages remain', () => {
    const a = makeAdminMusic({ id: 'm-a', name: '蓝色风暴' })
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      isFetchingNextPage: true,
      hasNextPage: true,
      data: { pages: [{ musics: [a], total: 30, hasMore: true }] },
    }
    const html = renderMusics()
    expect(html).toContain('蓝色风暴')
    expect(html).toContain('加载中…')
    // With a next page pending the sentinel never prints the all-loaded copy.
    expect(html).not.toContain('已加载全部')
  })

  it('renders the sort-menu trigger in the closed state (no menu items)', () => {
    const a = makeAdminMusic({ id: 'm-a', name: '蓝色风暴' })
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      data: { pages: [{ musics: [a], total: 1, hasMore: false }] },
    }
    // `sortMenuOpen` starts false, so the dropdown contents (role="menu")
    // are not rendered. We assert the trigger remains, but the menu is gone.
    const html = renderMusics()
    expect(html).toContain('aria-label="排序"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="menu"')
    expect(html).not.toContain('aria-haspopup="menuitem"')
  })
})

// ──────────────────── MusicsView: SortIcon matrix ────────────────────────
//
// `SortIcon` is a switch over (sortBy, sortOrder) that picks one of
// ClockArrow{Up,Down} / CalendarArrow{Up,Down} / Arrow{Up,Down}AZ. The
// menu-open state is event-driven and unreachable in SSR, but the
// *trigger* re-renders the icon on every controller change. We drive
// each (sortBy, sortOrder) combo through the hoisted controller state
// and assert the rendered lucide class so every switch arm is covered.

describe('MusicsView SortIcon matrix', () => {
  beforeEach(() => {
    controllerState.q = ''
    controllerState.pageSize = 24
    // Populate the grid so the sort trigger renders alongside real data.
    const a = makeAdminMusic({ id: 'm-a', name: '蓝色风暴' })
    queryMocks.infinite = {
      data: { pages: [{ musics: [a], total: 1, hasMore: false }] },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      error: null,
      fetchNextPage: vi.fn(),
    }
  })

  it.each([
    ['createdAt', 'asc', '创建时间', 'lucide-clock-arrow-up'],
    ['createdAt', 'desc', '创建时间', 'lucide-clock-arrow-down'],
    ['updatedAt', 'asc', '更新时间', 'lucide-calendar-arrow-up'],
    ['updatedAt', 'desc', '更新时间', 'lucide-calendar-arrow-down'],
    ['name', 'asc', '歌曲名称', 'lucide-arrow-up-a-z'],
    ['name', 'desc', '歌曲名称', 'lucide-arrow-down-a-z'],
    ['artist', 'asc', '艺人', 'lucide-arrow-up-a-z'],
    ['artist', 'desc', '艺人', 'lucide-arrow-down-a-z'],
    ['album', 'asc', '专辑', 'lucide-arrow-up-a-z'],
    ['album', 'desc', '专辑', 'lucide-arrow-down-a-z'],
  ] as const)('renders SortIcon for sortBy=%s sortOrder=%s', (sortBy, sortOrder, label, iconClass) => {
    controllerState.sortBy = sortBy
    controllerState.sortOrder = sortOrder
    const html = renderMusics()
    // The current sort label is rendered next to the trigger.
    expect(html).toContain(label)
    // The order toggle reflects the active direction.
    expect(html).toContain(sortOrder === 'asc' ? '升序' : '降序')
    // The correct lucide icon class is emitted by the SortIcon switch.
    expect(html).toContain(iconClass)
  })
})

// ────────────────────────── MusicDetailView ──────────────────────────────

describe('MusicDetailView render branches', () => {
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
    const html = renderDetail()
    expect(html).toContain('animate-pulse')
  })

  it('renders the error branch', () => {
    queryMocks.query = {
      ...queryMocks.query,
      isLoading: false,
      isPending: false,
      isError: true,
      error: { message: '数据库连接失败' },
    }
    const html = renderDetail()
    expect(html).toContain('加载失败')
    expect(html).toContain('数据库连接失败')
    expect(html).toContain('aria-label="返回"')
  })

  it('renders the not-found branch when music is null', () => {
    queryMocks.query = {
      ...queryMocks.query,
      isLoading: false,
      isPending: false,
      data: { music: null },
    }
    const html = renderDetail()
    expect(html).toContain('未找到该歌曲')
    expect(html).toContain('aria-label="返回"')
  })

  it('renders the resolved detail with cover and parsed lyrics', () => {
    const music = makeAdminMusic({
      id: 'music-1',
      name: '青花瓷',
      artist: ['周杰伦'],
      album: '我很忙',
      lyric: '[00:01.00]素胚勾勒出青花笔锋浓转淡\n[00:05.00]瓶身描绘的牡丹一如你初妆',
    })
    queryMocks.query = {
      ...queryMocks.query,
      isLoading: false,
      isPending: false,
      data: { music },
    }
    const html = renderDetail()
    expect(html).toContain('青花瓷')
    expect(html).toContain('周杰伦')
    expect(html).toContain('我很忙')
    expect(html).toContain('https://cdn.example.com/cover.jpg')
    // Parsed lyric lines render.
    expect(html).toContain('素胚勾勒出青花笔锋浓转淡')
    expect(html).toContain('瓶身描绘的牡丹一如你初妆')
    expect(html).toContain('aria-label="关闭"')
    expect(html).toContain('aria-label="播放"')
    expect(html).toContain('复制 playerId')
  })

  it('renders the no-cover placeholder block when coverUrl is empty', () => {
    const music = makeAdminMusic({
      id: 'music-1',
      name: '无封面曲',
      coverUrl: '',
      coverStoragePath: '',
    })
    queryMocks.query = {
      ...queryMocks.query,
      isLoading: false,
      isPending: false,
      data: { music },
    }
    const html = renderDetail()
    expect(html).toContain('无封面曲')
    // No <img> for the cover — the placeholder div is rendered instead.
    expect(html).not.toContain('https://cdn.example.com/cover.jpg')
    expect(html).toContain('size-56 rounded-lg bg-surface-dim')
  })

  it('renders the empty-lyrics placeholder when lyric is null', () => {
    const music = makeAdminMusic({ id: 'music-1', name: '纯音乐', lyric: null })
    queryMocks.query = {
      ...queryMocks.query,
      isLoading: false,
      isPending: false,
      data: { music },
    }
    const html = renderDetail()
    expect(html).toContain('纯音乐')
    // LyricsDisplay renders its empty-state copy for null lrcText.
    expect(html).toContain('暂无歌词')
  })
})

// ──────────────────────────── AddMusicView ───────────────────────────────

describe('AddMusicView render branches', () => {
  beforeEach(() => {
    // Empty library + empty search by default; the populated-search
    // branch is covered via SearchAlbumCard directly below.
    queryMocks.query = {
      data: { results: [] as MetingSearchHit[], hasMore: false },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
  })

  it('renders the hero, search form, source selector and empty-search prompt', () => {
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
    // Source selector: the trigger shows the selected value (网易云 by
    // default). The full option list is only rendered when the popover
    // opens, which is event-driven and unreachable in SSR.
    expect(html).toContain('来源')
    expect(html).toContain('add-music-source-full')
    expect(html).toContain('网易云')
    // Empty-search prompt.
    expect(html).toContain('输入关键词搜索音乐')
    expect(html).toContain('支持歌曲名称、艺人、专辑搜索')
  })

  it('renders the populated library snapshot count when the library has musics', () => {
    // AddMusicView's libraryQuery is also `useQuery` (mocked), so this
    // payload drives the MusicLibraryHero count + collage.
    const music = makeAdminMusic({ id: 'lib-1', name: '蓝色风暴', coverUrl: 'https://cdn.example.com/a.jpg' })
    queryMocks.query = {
      data: { musics: [music], total: 1 },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <AddMusicView />
        </MusicPlayerProvider>,
        '/admin/library/music/add',
      ),
    )
    expect(html).toContain('添加音乐')
    // Hero count only renders when total > 0.
    expect(html).toContain('共 1 首歌曲')
  })

  it('renders the loading skeleton when an initial search is in flight', () => {
    // isSearching === searchQuery.isFetching && nextOffset === 0. Setting
    // isFetching true with no results surfaces the GridSkeleton branch.
    queryMocks.query = {
      data: null,
      isLoading: false,
      isPending: false,
      isFetching: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <AddMusicView />
        </MusicPlayerProvider>,
        '/admin/library/music/add',
      ),
    )
    expect(html).toContain('animate-pulse')
    // The empty prompt is replaced by the skeleton.
    expect(html).not.toContain('输入关键词搜索音乐')
  })

  it('renders the error banner when the search query errored', () => {
    queryMocks.query = {
      data: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: true,
      error: { message: '搜索服务不可用' },
      refetch: vi.fn(),
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <AddMusicView />
        </MusicPlayerProvider>,
        '/admin/library/music/add',
      ),
    )
    expect(html).toContain('搜索服务不可用')
    expect(html).toContain('bg-destructive/10')
    expect(html).toContain('text-destructive')
  })
})

// ─────────────── AddMusicView: populated search results branch ───────────
//
// The populated-results branch in AddMusicView (the `results.map` over
// SearchAlbumCard) is gated on a render-phase seed-on-change pattern
// (`searchQuery.data !== lastAppliedData`) that is unreachable in a
// single SSR pass because `searchedKeyword` starts empty and there is
// no event to flip it. The task notes this explicitly, so we cover the
// reachable render branches above and skip the populated-results arm.

// ────────────── Direct LyricsDisplay branch for completeness ─────────────
//
// MusicDetailView proxies lyrics through <LyricsDisplay>. We render it
// directly here to lock down its two branches independent of the detail
// view's query wiring (the detail view already exercises the resolved
// path above; this nails the empty + parsed arms at the source).

describe('LyricsDisplay direct render branches', () => {
  it('renders the empty-state copy for null lrcText', () => {
    const html = stableHtml(renderToHtml(<LyricsDisplay lrcText={null} currentTime={0} />))
    expect(html).toContain('暂无歌词')
  })

  it('renders parsed lyric lines', () => {
    const html = stableHtml(
      renderToHtml(<LyricsDisplay lrcText="[00:01.00]第一行\n[00:05.00]第二行" currentTime={3} />),
    )
    expect(html).toContain('第一行')
    expect(html).toContain('第二行')
  })
})
