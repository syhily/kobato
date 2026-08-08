import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminImageDto } from '@/shared/contracts/images'
import type { ActiveImageFilter } from '@/ui/admin/images/useImagesReducer'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { ImageDetailDialog } from '@/ui/admin/images/ImageDetailDialog'
import { ImagesFilterBar } from '@/ui/admin/images/ImagesFilterBar'
import { ImagesView } from '@/ui/admin/images/ImagesView'
import {
  buildJustifiedRows,
  JustifiedImageGrid,
  JustifiedImageGridSkeleton,
} from '@/ui/admin/images/JustifiedImageGrid'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: { pages: [] as { images: AdminImageDto[]; total: number; hasMore: boolean }[] },
  isLoading: true,
  isPending: true,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null as unknown,
  fetchNextPage: vi.fn(),
}

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
}

// The query layer is stubbed with a hoisted mutable singleton (tags/friends/
// musics pattern) so the data-loaded render paths run; the mock defaults to
// the pending state for the loading test.

// Varied dimensions give the justified-rows algorithm meaningful aspect ratios.
function makeImage(overrides: Partial<AdminImageDto> & { id: string } = { id: 'img-1' }): AdminImageDto {
  return {
    kind: 'generic',
    storagePath: `images/${overrides.id}.jpg`,
    publicUrl: `https://cdn.example.com/images/${overrides.id}.jpg`,
    mimeType: 'image/jpeg',
    width: 400,
    height: 300,
    byteSize: 1024,
    thumbhash: null,
    uploaderId: null,
    uploaderName: null,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('snapshot: ImagesView', () => {
  beforeEach(() => {
    // Reset to pending/loading; data-loaded cases reassign below.
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
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders the page shell with header, upload button and filter bar under SSR (pending/loading)', () => {
    const html = renderInRouter(<ImagesView />, '/admin/library/images')

    // Title + total-count render off the pending query (total defaults to 0).
    expect(html).toContain('图片管理')
    expect(html).toContain('上传图片')

    // No-filter trigger shows the bare "筛选" label.
    expect(html).toContain('筛选')

    // Loading branch → skeleton placeholder tiles.
    expect(html).toMatch(/rounded-xl/)

    // The upload affordance is a real button surfaced to AT users.
    expect(html).toMatch(/<button[^>]*>/)
  })

  it('renders the empty-state branch when the query resolves with no images', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      data: { pages: [{ images: [], total: 0, hasMore: false }] },
    }
    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))
    // The "未找到图片" empty card replaces the grid; total stays 0.
    expect(html).toContain('图片管理')
    expect(html).toContain('共 0 条')
    expect(html).toContain('未找到图片')
    expect(html).not.toContain('已加载全部')
  })

  it('renders the populated grid body and end-of-list footer when images resolve', () => {
    const images = [
      makeImage({
        id: 'img-1',
        storagePath: 'images/poster-a.jpg',
        publicUrl: 'https://cdn.example.com/images/poster-a.jpg',
      }),
      makeImage({
        id: 'img-2',
        storagePath: 'images/poster-b.jpg',
        publicUrl: 'https://cdn.example.com/images/poster-b.jpg',
      }),
      makeImage({ id: 'img-3', kind: 'category', storagePath: 'images/categories/news.jpg' }),
    ]
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      hasNextPage: false,
      data: { pages: [{ images, total: images.length, hasMore: false }] },
    }
    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))
    expect(html).toContain('图片管理')
    expect(html).toContain(`共 ${images.length} 条`)
    // Grid falls back to skeleton on SSR; the sentinel copy proves the data-loaded branch.
    expect(html).toContain(`已加载全部 ${images.length} 张图片`)
    expect(html).toMatch(/rounded-xl/)
  })
})

describe('snapshot: ImagesFilterBar', () => {
  it('renders the bare "筛选" trigger when no filters are active', () => {
    const html = stableHtml(
      renderToHtml(
        <ImagesFilterBar filters={[]} onAddFilter={() => {}} onRemoveFilter={() => {}} onClearFilters={() => {}} />,
      ),
    )
    expect(html).toContain('筛选')
    expect(html).not.toContain('添加筛选')
    expect(html).not.toContain('清除')
  })

  it('renders search and kind chips plus the clear button when filters are active', () => {
    const filters: ActiveImageFilter[] = [
      { field: 'q', value: 'poster', label: 'poster' },
      { field: 'kind', value: 'friend', label: '友链海报' },
    ]
    const html = stableHtml(
      renderToHtml(
        <ImagesFilterBar
          filters={filters}
          onAddFilter={() => {}}
          onRemoveFilter={() => {}}
          onClearFilters={() => {}}
        />,
      ),
    )
    expect(html).toContain('搜索')
    expect(html).toContain('poster')
    // Kind chip label is hardcoded to "用途".
    expect(html).toContain('用途')
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
  })
})

describe('snapshot: buildJustifiedRows', () => {
  it('returns an empty array for empty input', () => {
    expect(buildJustifiedRows([], 1200, 200, 12)).toEqual([])
  })

  it('returns an empty array when the container width is zero', () => {
    const rows = buildJustifiedRows([makeImage({ id: 'a' })], 0, 200, 12)
    expect(rows).toEqual([])
  })

  it('packs a single image into one row at the target height', () => {
    // Lone image flushes as a non-filled last row at target height.
    const rows = buildJustifiedRows([makeImage({ id: 'a', width: 800, height: 600 })], 1200, 200, 12)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.items).toHaveLength(1)
    expect(row.height).toBe(200)
    expect(row.items[0]!.width).toBe(Math.floor((200 * 800) / 600))
  })

  it('force-fills a single oversized image row so the item spans the container', () => {
    // Oversized lone image → row scaled down, item width snaps to container.
    const rows = buildJustifiedRows([makeImage({ id: 'wide', width: 2400, height: 200 })], 1200, 200, 12)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.items).toHaveLength(1)
    expect(row.items[0]!.width).toBe(1200)
    expect(row.height).toBeLessThan(200)
  })

  it('splits overflowing images across multiple rows', () => {
    const images = Array.from({ length: 6 }, (_, i) => makeImage({ id: `img-${i}`, width: 800, height: 600 }))
    const rows = buildJustifiedRows(images, 800, 200, 12)
    expect(rows.length).toBeGreaterThan(1)
    // Rows must fit the container width including inter-item gaps.
    for (const row of rows) {
      const total = row.items.reduce((sum, item) => sum + item.width, 0) + 12 * (row.items.length - 1)
      expect(total).toBeLessThanOrEqual(800 + 1)
      expect(row.items.every((item) => item.height === row.height)).toBe(true)
    }
  })
})

describe('snapshot: JustifiedImageGrid (component)', () => {
  it('falls back to the skeleton while the container width is unknown during SSR', () => {
    // useElementWidth returns 0 on the server → skeleton instead of measured rows.
    const html = stableHtml(
      renderToHtml(
        <JustifiedImageGrid
          images={[makeImage({ id: 'a' }), makeImage({ id: 'b' })]}
          assetHost="cdn.example.com"
          onSelect={() => {}}
        />,
      ),
    )
    expect(html).toMatch(/rounded-xl/)
    expect(html).not.toContain('查看图片')
  })
})

describe('snapshot: JustifiedImageGridSkeleton', () => {
  it('renders four rows of rounded placeholder tiles', () => {
    const html = stableHtml(renderToHtml(<JustifiedImageGridSkeleton />))
    expect(html).toMatch(/rounded-xl/)
    // Four rows are emitted by default (see Array.from({ length: 4 })).
    const rowCount = html.match(/height:200/g)?.length ?? 0
    expect(rowCount).toBe(4)
  })
})

describe('snapshot: ImageDetailDialog', () => {
  it('renders nothing when no image is supplied (closed state)', () => {
    const html = stableHtml(
      renderToHtml(
        <ImageDetailDialog
          image={null}
          open={false}
          onClose={() => {}}
          copied={false}
          isSavingNote={false}
          isRecalculatingThumbhash={false}
          onCopyUrl={() => {}}
          onSaveNote={() => {}}
          onDelete={() => {}}
          onRecalculateThumbhash={() => {}}
        />,
      ),
    )
    expect(html).toBe('')
  })

  it('renders nothing when open is true but no image is supplied', () => {
    // image === null early-returns before any DOM, even when open.
    const html = stableHtml(
      renderToHtml(
        <ImageDetailDialog
          image={null}
          open={true}
          onClose={() => {}}
          copied={false}
          isSavingNote={false}
          isRecalculatingThumbhash={false}
          onCopyUrl={() => {}}
          onSaveNote={() => {}}
          onDelete={() => {}}
          onRecalculateThumbhash={() => {}}
        />,
      ),
    )
    expect(html).toBe('')
  })
})
