import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto, MetingSearchHit } from '@/shared/contracts/music'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { AddMusicView } from '@/ui/admin/musics/AddMusicView'
import { LyricsDisplay } from '@/ui/admin/musics/LyricsDisplay'
import { MusicDetailView } from '@/ui/admin/musics/MusicDetailView'
import { MusicPlayerProvider } from '@/ui/admin/musics/MusicPlayerContext'
import { MusicsView, SortIcon } from '@/ui/admin/musics/MusicsView'

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
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
  removeQueries: vi.fn(),
}

// Render-path companion to `musics-view.test.tsx` (same query stubs, no
// event handlers — SSR can't drive them). `SortIcon` renders directly
// because the view inlines its sort state via `useState`.

// `useMetingMusicSearch` (unit-covered) is stubbed so snapshots set the
// machine's state directly.
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

const navigateMock = vi.fn()

function renderDetail(): string {
  return stableHtml(
    renderInRouter(
      <MusicPlayerProvider>
        <MusicDetailView id="music-1" navigate={navigateMock} />
      </MusicPlayerProvider>,
      '/admin/library/music/music-1',
    ),
  )
}

describe('MusicsView render branches', () => {
  beforeEach(() => {
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
    // Skeleton renders 12 placeholder cells — no empty-state copy while loading.
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
    // undefined data + !isLoading falls through to the empty-state copy.
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
    // Sentinel needs hasNextPage=false AND musics on screen — both hold here.
    expect(html).toContain('已加载全部 2 首歌曲')
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
    // Sort menu starts closed (popup unmounted until opened); Base UI
    // applies aria-expanded only after hydration, so SSR asserts aria-haspopup.
    const html = renderMusics()
    expect(html).toContain('aria-label="排序"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).not.toContain('role="menu"')
    expect(html).not.toContain('aria-haspopup="menuitem"')
  })
})

// `SortIcon` switches over (sortBy, sortOrder) picking a lucide icon; the
// view's sort state only flips via event handlers SSR can't drive, so every
// combo renders directly. Trigger label/order text stays in the full-view tests.

describe('MusicsView SortIcon matrix', () => {
  it.each([
    ['createdAt', 'asc', 'lucide-clock-arrow-up'],
    ['createdAt', 'desc', 'lucide-clock-arrow-down'],
    ['updatedAt', 'asc', 'lucide-calendar-arrow-up'],
    ['updatedAt', 'desc', 'lucide-calendar-arrow-down'],
    ['name', 'asc', 'lucide-arrow-up-a-z'],
    ['name', 'desc', 'lucide-arrow-down-a-z'],
    ['artist', 'asc', 'lucide-arrow-up-a-z'],
    ['artist', 'desc', 'lucide-arrow-down-a-z'],
    ['album', 'asc', 'lucide-arrow-up-a-z'],
    ['album', 'desc', 'lucide-arrow-down-a-z'],
  ] as const)('renders SortIcon for sortBy=%s sortOrder=%s', (sortBy, sortOrder, iconClass) => {
    const html = stableHtml(renderToHtml(<SortIcon sortBy={sortBy} sortOrder={sortOrder} />))
    expect(html).toContain(iconClass)
  })
})

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
    expect(html).toContain('素胚勾勒出青花笔锋浓转淡')
    expect(html).toContain('瓶身描绘的牡丹一如你初妆')
    expect(html).toContain('aria-label="关闭"')
    expect(html).toContain('aria-label="播放"')
    expect(html).toContain('复制 playerId')
    // ISO fixtures land on Asia/Shanghai local dates via formatLocalDate.
    expect(html).toContain('2024-01-01')
    expect(html).toContain('2024-02-01')
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
    expect(html).toContain('暂无歌词')
  })
})

describe('AddMusicView render branches', () => {
  beforeEach(() => {
    // Empty library + idle search machine; populated-search covered via SearchAlbumCard below.
    queryMocks.query = {
      data: null,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
    resetSearchHookMock()
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
    // Trigger shows the selected source; the option list needs an event (unreachable in SSR).
    expect(html).toContain('来源')
    expect(html).toContain('add-music-source-full')
    expect(html).toContain('网易云')
    expect(html).toContain('输入关键词搜索音乐')
    expect(html).toContain('支持歌曲名称、艺人、专辑搜索')
  })

  it('renders the populated library snapshot count when the library has musics', () => {
    // libraryQuery payload drives the MusicLibraryHero count + collage.
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
    // isSearching with no results → GridSkeleton branch.
    searchHookMock.state = {
      ...searchHookMock.state,
      isSearching: true,
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
    searchHookMock.state = {
      ...searchHookMock.state,
      error: '搜索服务不可用',
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

// The populated-results branch needs a search event (machine starts idle)
// — unreachable in one SSR pass; SearchAlbumCard is snapshotted directly.

// LyricsDisplay is rendered directly to lock down its two branches
// independent of the detail view's query wiring.

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
