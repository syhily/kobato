import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminMusicDto, MetingSearchHit } from '@/shared/contracts/music'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { AddMusicDialog } from '@/ui/admin/musics/AddMusicDialog'
import { AddMusicView } from '@/ui/admin/musics/AddMusicView'
import { MusicDetailView } from '@/ui/admin/musics/MusicDetailView'
import { MusicPlayerProvider } from '@/ui/admin/musics/MusicPlayerContext'
import { SearchAlbumCard } from '@/ui/admin/musics/SearchAlbumCard'
import { SearchResultItem } from '@/ui/admin/musics/SearchResultItem'

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

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
  removeQueries: vi.fn(),
}

// Same mock pattern as `musics-view.test.tsx` (mock-react-query seams,
// inert sonner, orpcQuery runs but never executes); dialog primitives are
// stubbed because the real Base UI portal never mounts under SSR.

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

// Stub motion/react as an SSR-safe passthrough so the lazy-motion branch
// renders children directly (keeps the SSR output stable).
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof import('motion/react')>('motion/react')
  // Strip motion-only props so they don't leak onto the DOM.
  const MOTION_ONLY_PROPS = new Set([
    'initial',
    'animate',
    'exit',
    'transition',
    'variants',
    'whileHover',
    'whileTap',
    'whileFocus',
    'whileDrag',
    'whileInView',
    'onAnimationStart',
    'onAnimationComplete',
    'dragControls',
    'dragConstraints',
    'dragElastic',
    'dragMomentum',
    'dragSnapToOrigin',
    'dragTransition',
  ])
  return {
    ...actual,
    motion: new Proxy(
      {},
      {
        get: () => {
          // Every `motion.X` access becomes a pass-through element forwarding DOM-safe props.
          const MotionStub = ({
            children,
            as,
            ...rest
          }: { children?: React.ReactNode; as?: string } & Record<string, unknown>) => {
            const Tag = (as ?? 'div') as React.ElementType
            for (const key of MOTION_ONLY_PROPS) {
              delete rest[key]
            }
            return <Tag {...rest}>{children}</Tag>
          }
          return MotionStub
        },
      },
    ),
  }
})

vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))

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

function makeSearchHit(overrides: Partial<MetingSearchHit> = {}): MetingSearchHit {
  return {
    source: 'netease',
    sourceId: '2001',
    name: 'Hello',
    artist: ['Adele'],
    album: '25',
    coverUrl: 'https://cdn.example.com/hello.jpg',
    previewUrl: 'https://cdn.example.com/preview.mp3',
    ...overrides,
  }
}

const SAMPLE_LRC = ['[00:01.00]夜了呢', '[00:05.00]月光下的苍白', '[00:10.00]手风琴弹奏着那年代的向往'].join('\n')

function resetQueryMocks(): void {
  queryMocks.query = {
    data: null,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }
  queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  resetSearchHookMock()
}

describe('snapshot: AddMusicDialog', () => {
  beforeEach(resetQueryMocks)

  it('renders nothing while closed', () => {
    const html = stableHtml(
      renderToHtml(
        <MusicPlayerProvider>
          <AddMusicDialog open={false} onClose={() => undefined} onAdded={() => undefined} />
        </MusicPlayerProvider>,
      ),
    )
    expect(html).toBe('')
  })

  it('renders the dialog chrome, search form and source selector when open', () => {
    queryMocks.query = {
      ...queryMocks.query,
      // No data yet → results stay empty, empty-search prompt shows.
      data: null,
    }
    const html = stableHtml(
      renderToHtml(
        <MusicPlayerProvider>
          <AddMusicDialog open={true} onClose={() => undefined} onAdded={() => undefined} />
        </MusicPlayerProvider>,
      ),
    )
    expect(html).toContain('添加音乐')
    expect(html).toContain('搜索并添加音乐到曲库')
    expect(html).toContain('placeholder="例：Adele Hello、稻香、夜曲"')
    expect(html).toContain('搜索')
    expect(html).toContain('来源')
    expect(html).toContain('每页')
    expect(html).toContain('输入关键词后点击搜索。')
    expect(html).toContain('关闭')
  })

  it('renders skeletons when the search query is fetching and there are no results yet', () => {
    // isSearching with no results → three Skeleton rows.
    searchHookMock.state = {
      ...searchHookMock.state,
      isSearching: true,
    }
    const html = stableHtml(
      renderToHtml(
        <MusicPlayerProvider>
          <AddMusicDialog open={true} onClose={() => undefined} onAdded={() => undefined} />
        </MusicPlayerProvider>,
      ),
    )
    expect(html).toContain('添加音乐')
    // Base UI Skeleton renders with animate-pulse.
    expect(html).toContain('animate-pulse')
  })

  it('renders the error banner when the search query rejects', () => {
    searchHookMock.state = {
      ...searchHookMock.state,
      error: '上游服务暂不可用',
    }
    const html = stableHtml(
      renderToHtml(
        <MusicPlayerProvider>
          <AddMusicDialog open={true} onClose={() => undefined} onAdded={() => undefined} />
        </MusicPlayerProvider>,
      ),
    )
    expect(html).toContain('上游服务暂不可用')
    expect(html).toContain('text-destructive')
  })
})

// Result-row markup is covered directly — the dialog's seed-on-change path can't run under SSR.

describe('snapshot: SearchResultItem', () => {
  it('renders the hit cover, title, artist, album and action buttons', () => {
    const hit = makeSearchHit({ name: 'Hello', artist: ['Adele'], album: '25' })
    const html = stableHtml(
      renderToHtml(
        <SearchResultItem
          hit={hit}
          previewActive={false}
          adding={false}
          added={false}
          onPreview={() => undefined}
          onAdd={() => undefined}
        />,
      ),
    )
    expect(html).toContain('Hello')
    expect(html).toContain('Adele')
    expect(html).toContain('25')
    expect(html).toContain('aria-label="试听"')
    expect(html).toContain('添加')
    expect(html).toContain('https://cdn.example.com/hello.jpg')
  })

  it('renders the placeholder block when the hit has no cover url', () => {
    const hit = makeSearchHit({ coverUrl: '' })
    const html = stableHtml(
      renderToHtml(
        <SearchResultItem
          hit={hit}
          previewActive={false}
          adding={false}
          added={false}
          onPreview={() => undefined}
          onAdd={() => undefined}
        />,
      ),
    )
    expect(html).not.toContain('https://cdn.example.com/hello.jpg')
  })

  it('reflects the adding / added / previewActive states in button labels', () => {
    const hit = makeSearchHit({ name: '搁浅' })
    const adding = stableHtml(
      renderToHtml(
        <SearchResultItem
          hit={hit}
          previewActive={false}
          adding={true}
          added={false}
          onPreview={() => undefined}
          onAdd={() => undefined}
        />,
      ),
    )
    expect(adding).toContain('添加中')

    const added = stableHtml(
      renderToHtml(
        <SearchResultItem
          hit={hit}
          previewActive={false}
          adding={false}
          added={true}
          onPreview={() => undefined}
          onAdd={() => undefined}
        />,
      ),
    )
    expect(added).toContain('已添加')

    const previewing = stableHtml(
      renderToHtml(
        <SearchResultItem
          hit={hit}
          previewActive={true}
          adding={false}
          added={false}
          onPreview={() => undefined}
          onAdd={() => undefined}
        />,
      ),
    )
    expect(previewing).toContain('aria-label="停止"')
  })
})

describe('snapshot: AddMusicView', () => {
  beforeEach(resetQueryMocks)

  it('renders the hero, search form and source selector with the empty-search prompt', () => {
    queryMocks.query = {
      ...queryMocks.query,
      data: null,
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
    expect(html).toContain('aria-label="搜索音乐"')
    expect(html).toContain('placeholder="搜索歌曲、艺人、专辑..."')
    expect(html).toContain('来源')
    expect(html).toContain('aria-label="关闭"')
    expect(html).toContain('输入关键词搜索音乐')
    expect(html).toContain('支持歌曲名称、艺人、专辑搜索')
  })

  it('renders the hero song count and a populated library snapshot when libraryQuery resolves', () => {
    // `libraryQuery.data` drives the hero, so a populated library IS
    // reachable on SSR; the search grid stays empty (machine starts idle).
    const music = makeAdminMusic({ name: '蓝色风暴', artist: ['周杰伦'] })
    queryMocks.query = {
      ...queryMocks.query,
      data: { musics: [music], total: 1, hasMore: false },
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
    expect(html).toContain('共 1 首歌曲')
    // Search state stays empty on SSR, so the prompt remains.
    expect(html).toContain('输入关键词搜索音乐')
  })

  it('renders the grid skeleton when the search query is fetching', () => {
    // isSearching with no results → GridSkeleton (12 animate-pulse cells).
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
    expect(html).toContain('aspect-square')
  })

  it('renders the error banner when the search query rejects', () => {
    searchHookMock.state = {
      ...searchHookMock.state,
      error: '搜索接口超时',
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <AddMusicView />
        </MusicPlayerProvider>,
        '/admin/library/music/add',
      ),
    )
    expect(html).toContain('搜索接口超时')
    expect(html).toContain('text-destructive')
  })
})

describe('snapshot: SearchAlbumCard', () => {
  it('renders the cover, title, artist and album for a populated hit', () => {
    const hit = makeSearchHit({ name: 'Hello', artist: ['Adele'], album: '25' })
    const html = stableHtml(
      renderToHtml(
        <SearchAlbumCard
          hit={hit}
          adding={false}
          added={false}
          isCurrent={false}
          isPlaying={false}
          onAdd={() => undefined}
          onPreview={() => undefined}
        />,
      ),
    )
    expect(html).toContain('Hello')
    expect(html).toContain('Adele')
    expect(html).toContain('25')
    expect(html).toContain('aria-label="添加音乐"')
    expect(html).toContain('https://cdn.example.com/hello.jpg')
  })

  it('shows the play affordance when the hit has a preview url', () => {
    const hit = makeSearchHit()
    const html = stableHtml(
      renderToHtml(
        <SearchAlbumCard
          hit={hit}
          adding={false}
          added={false}
          isCurrent={false}
          isPlaying={false}
          onAdd={() => undefined}
          onPreview={() => undefined}
        />,
      ),
    )
    expect(html).toContain('aria-label="播放"')
  })

  it('renders the added state and active ring when the card is current', () => {
    const hit = makeSearchHit({ name: '搁浅' })
    const added = stableHtml(
      renderToHtml(
        <SearchAlbumCard
          hit={hit}
          adding={false}
          added={true}
          isCurrent={false}
          isPlaying={false}
          onAdd={() => undefined}
          onPreview={() => undefined}
        />,
      ),
    )
    expect(added).toContain('aria-label="已添加"')

    const current = stableHtml(
      renderToHtml(
        <SearchAlbumCard
          hit={hit}
          adding={false}
          added={false}
          isCurrent={true}
          isPlaying={true}
          onAdd={() => undefined}
          onPreview={() => undefined}
        />,
      ),
    )
    expect(current).toContain('aria-label="暂停"')
    expect(current).toContain('ring-primary')
  })
})

// Pure-props view — the route module supplies id + navigate.
const navigateMock = vi.fn()

describe('snapshot: MusicDetailView', () => {
  beforeEach(resetQueryMocks)

  it('renders the detail skeleton while loading', () => {
    queryMocks.query = {
      ...queryMocks.query,
      isLoading: true,
      isPending: true,
    }
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

  it('renders the error branch when the music query rejects', () => {
    queryMocks.query = {
      ...queryMocks.query,
      isError: true,
      error: { message: '上游暂不可用' },
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicDetailView id="music-1" navigate={navigateMock} />
        </MusicPlayerProvider>,
        '/admin/library/music/music-1',
      ),
    )
    expect(html).toContain('加载失败')
    expect(html).toContain('上游暂不可用')
    expect(html).toContain('aria-label="返回"')
  })

  it('renders the not-found branch when the music resolves to null', () => {
    queryMocks.query = {
      ...queryMocks.query,
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

  it('renders the full detail body — cover, track metadata, action bar and lyrics — when the music resolves', () => {
    const music = makeAdminMusic({
      id: 'music-42',
      name: '青花瓷',
      artist: ['周杰伦'],
      album: '我很忙',
      playerId: '0123456789abcdef',
      sourceId: '4242',
      coverUrl: 'https://cdn.example.com/qinghua.jpg',
      lyric: SAMPLE_LRC,
      createdAt: '2024-03-04T05:06:07.000Z',
      updatedAt: '2024-04-05T06:07:08.000Z',
    })
    queryMocks.query = {
      ...queryMocks.query,
      data: { music },
    }
    const html = stableHtml(
      renderInRouter(
        <MusicPlayerProvider>
          <MusicDetailView id="music-42" navigate={navigateMock} />
        </MusicPlayerProvider>,
        '/admin/library/music/music-42',
      ),
    )
    // Track identity (artist list joined by ' / ', then ' · album')
    expect(html).toContain('青花瓷')
    expect(html).toContain('周杰伦 · 我很忙')
    expect(html).toContain('https://cdn.example.com/qinghua.jpg')
    // Subtitle line: source · uploader · createdAt (formatted YYYY-MM-DD)
    expect(html).toContain('netease')
    expect(html).toContain('雨帆')
    expect(html).toContain('2024-03-04')
    expect(html).toContain('aria-label="关闭"')
    // Action bar (not editing → play / copy / edit / delete)
    expect(html).toContain('aria-label="播放"')
    expect(html).toContain('复制 playerId')
    expect(html).toContain('编辑')
    expect(html).toContain('删除')
    expect(html).toContain('playerId')
    expect(html).toContain('0123456789abcdef')
    expect(html).toContain('sourceId')
    expect(html).toContain('4242')
    expect(html).toContain('上传者')
    expect(html).toContain('更新时间')
    expect(html).toContain('2024-04-05')
    expect(html).toContain('歌词')
    expect(html).toContain('夜了呢')
    expect(html).toContain('月光下的苍白')
    expect(html).toContain('手风琴弹奏着那年代的向往')
  })

  it('renders a placeholder block instead of a cover img when the music has no coverUrl', () => {
    const music = makeAdminMusic({ coverUrl: '', name: '无封面曲' })
    queryMocks.query = {
      ...queryMocks.query,
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
    expect(html).toContain('无封面曲')
    expect(html).not.toContain('https://cdn.example.com/cover.jpg')
    expect(html).toContain('bg-surface-dim')
  })

  it('falls back to the empty-lyric copy when the resolved music has no lyric', () => {
    const music = makeAdminMusic({ lyric: null, name: '纯音乐' })
    queryMocks.query = {
      ...queryMocks.query,
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
    expect(html).toContain('歌词')
    expect(html).toContain('暂无歌词')
  })
})
